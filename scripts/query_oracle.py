"""Independent SQL/parameter/result oracle against the pinned Python 0.6.1 + #44."""
import json
from pathlib import Path
import sqlite3
import tempfile

from python_reference import ROOT

from asqueel import SqlMigrationRenderer, QueryCompiler
from asqueel.model import resolve_model
from asqueel.adapters.sqlite import SqlDbAdapter
from asqueel.write_compiler import WriteCompiler
from asqueel_migration import SqlMigrator
from asqueel_migration.adapters.sqlite_adapter import SqliteDatabase
from browser_queries import query_model
from query_features import feature_model
from asqueel.environment import SqlEnvironment
from model_oracle import document


def requests(filename):
    return [(c['name'], c['request']) for c in json.loads((ROOT / 'test' / filename).read_text())]


def query_oracle(builder=None, inputs='query-inputs.json'):
    builder = builder if builder is not None else query_model()
    desired = SqlMigrationRenderer(builder).render()
    model = resolve_model(builder)
    adapter = SqlDbAdapter(None)
    writer = WriteCompiler(adapter)
    result = {"model": document(model), "desired": desired, "cases": []}
    with tempfile.TemporaryDirectory(prefix="asqueel-query-oracle-") as directory:
        path = str(Path(directory) / "query.db")
        db = SqliteDatabase({"dbname": path}, application_schemas=["main"])
        migration = SqlMigrator(db, structure=desired)
        migration.prepareMigrationCommands()
        migration.applyChanges()
        connection = sqlite3.connect(path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        if inputs == 'query-feature-inputs.json':
            # The additive JS migrator deliberately rejects generated-column DDL.
            # Compile/execute queries against the independently migrated Python schema.
            result['ddl'] = [row['sql'] for row in connection.execute(
                "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid")]
        try:
            for name, request in requests(inputs):
                kwargs = {k: v for k, v in request.items() if k not in ("operation", "table")}
                environment = kwargs.pop('environment', {})
                compiler = QueryCompiler(model, adapter, environment=SqlEnvironment(environment))
                if request['operation'] in ('select', 'count'):
                    compiled = getattr(compiler, request['operation'])(request['table'], **kwargs)
                else:
                    values = kwargs.pop('values')
                    compiled = getattr(writer, request['operation'])(model.table(request['table']), values, environment, **kwargs)
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
    features = query_oracle(feature_model(), 'query-feature-inputs.json')
    (ROOT / 'test/fixtures/query-features.json').write_text(json.dumps(features, indent=2, ensure_ascii=False) + '\n')
    print(f"Python: {len(features['cases'])} additional feature cases compiled and executed on SQLite.")
