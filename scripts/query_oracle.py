"""Historical query oracle for core 926000d (not compatible with Python 0.6.0).

Kept as the recipe for the upcoming query-port phase; not used by export or CI.
The corresponding frozen SQL regression fixture retains its separate provenance.
"""
import json
from pathlib import Path
import sqlite3
import tempfile

from python_reference import ROOT

from asqueel import SqlMigrationRenderer, QueryCompiler
from asqueel.model import resolve_model
from asqueel.dialects.sqlite import SqliteDialect
from asqueel.drivers.sqlite import SqliteDriver
from asqueel_migration import SqlMigrator
from asqueel_migration.adapters.sqlite_adapter import SqliteDatabase
from browser_queries import query_model


def requests():
    return [
        ("insert_person", {"operation": "insert", "table": "notes.person",
                          "values": {"id": 101, "name": "Ada", "active": True}, "returning": "$id,$name,$active"}),
        ("insert_quoted", {"operation": "insert", "table": "notes.person",
                          "values": {"id": 102, "name": "O'Brien; -- $id :name", "active": False}, "returning": "*"}),
        ("insert_memo", {"operation": "insert", "table": "notes.memo",
                        "values": {"id": 201, "person_id": 101, "body": "Prima nota", "amount": 42.5}, "returning": "*"}),
        ("insert_null", {"operation": "insert", "table": "notes.memo",
                        "values": {"id": 202, "person_id": 102, "body": None, "amount": 0}, "returning": "$id,$body"}),
        ("insert_no_return", {"operation": "insert", "table": "notes.memo",
                             "values": {"id": 203, "person_id": 101, "body": "Seconda nota", "amount": 10}, "returning": None}),
        ("people", {"operation": "select", "table": "notes.person", "columns": "*", "order_by": "$id"}),
        ("active_people", {"operation": "select", "table": "notes.person", "columns": "$id,$name",
                           "where": "$active = :active AND $name LIKE :pattern", "sqlparams": {"active": True, "pattern": "%da%"}}),
        ("related_notes", {"operation": "select", "table": "notes.memo",
                          "columns": "$id,$body,@person_id.name AS person,$amount",
                          "where": "$amount >= :minimum", "sqlparams": {"minimum": 10}, "order_by": "$id"}),
        ("collection", {"operation": "select", "table": "notes.memo", "columns": "$id,@person_id.name",
                        "where": "$id IN :ids", "sqlparams": {"ids": [201, 203]}, "order_by": "$id"}),
        ("empty_collection", {"operation": "select", "table": "notes.memo", "columns": "$id",
                              "where": "$id IN :ids", "sqlparams": {"ids": []}}),
        ("not_in_empty", {"operation": "select", "table": "notes.memo", "columns": "$id",
                          "where": "$id NOT IN :ids", "sqlparams": {"ids": []}, "order_by": "$id"}),
        ("binding_collision", {"operation": "select", "table": "notes.memo", "columns": "$id",
                               "where": "$id IN :ids AND $id <> :ids_0", "sqlparams": {"ids": [201, 202], "ids_0": 202}}),
        ("page", {"operation": "select", "table": "notes.memo", "columns": "$id,$body", "order_by": "$id",
                  "limit": 1, "offset": 1}),
        ("offset_only", {"operation": "select", "table": "notes.memo", "columns": "$id", "order_by": "$id", "offset": 1}),
        ("zero_limit", {"operation": "select", "table": "notes.memo", "columns": "$id", "limit": 0}),
        ("null_filter", {"operation": "select", "table": "notes.memo", "columns": "$id", "where": "$body IS NULL"}),
        ("quoted_expression", {"operation": "select", "table": "notes.memo",
                               "columns": "$id,':literal $id; --' AS literal", "where": "$id = :id", "sqlparams": {"id": 201}}),
        ("total", {"operation": "select", "table": "notes.memo", "columns": "SUM($amount) AS total"}),
    ]


def query_oracle():
    builder = query_model()
    desired = SqlMigrationRenderer(builder).render()
    compiler = QueryCompiler(resolve_model(builder), SqliteDialect(), SqliteDriver())
    result = {"desired": desired, "cases": []}
    with tempfile.TemporaryDirectory(prefix="asqueel-query-oracle-") as directory:
        path = str(Path(directory) / "query.db")
        db = SqliteDatabase({"dbname": path}, application_schemas=["main"])
        migration = SqlMigrator(db, structure=desired)
        migration.prepareMigrationCommands()
        migration.applyChanges()
        connection = sqlite3.connect(path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        try:
            for name, request in requests():
                kwargs = {k: v for k, v in request.items() if k not in ("operation", "table")}
                compiled = getattr(compiler, request["operation"])(request["table"], **kwargs)
                cursor = connection.execute(compiled.sql, dict(compiled.params))
                rows = [dict(row) for row in cursor.fetchall()]
                result["cases"].append({"name": name, "request": request,
                    "compiled": {"sql": compiled.sql, "params": dict(compiled.params)}, "rows": rows})
            connection.commit()
        finally:
            connection.close()
    return result


if __name__ == "__main__":
    oracle = query_oracle()
    (ROOT / "test/fixtures/queries.json").write_text(json.dumps(oracle, indent=2, ensure_ascii=False) + "\n")
    print(f"Python: {len(oracle['cases'])} query cases compiled and executed on SQLite.")
