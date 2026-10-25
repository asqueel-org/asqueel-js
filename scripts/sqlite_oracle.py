"""Execute both migration stages in Python, read SQLite back, check idempotence."""
import json
from pathlib import Path
import runpy
import sqlite3
import tempfile

from python_reference import ROOT

from python_model import migration as render_migration
from asqueel_migration import SqlMigrator, StructureValidator
from asqueel_migration.adapters.sqlite_adapter import SqliteDatabase
from asqueel_migration.readers.sqlite_reader import SqliteReader


def sqlite_oracle():
    build = runpy.run_path(str(ROOT / "examples/browser_sqlite.py"))["browser_model"]
    result = {}
    with tempfile.TemporaryDirectory(prefix="asqueel-sqlite-oracle-") as directory:
        path = str(Path(directory) / "browser.db")
        db = SqliteDatabase({"dbname": path}, application_schemas=["main"])
        for version in (1, 2):
            desired = render_migration(build(version))
            migration = SqlMigrator(db, structure=desired)
            migration.prepareMigrationCommands()
            sql = migration.getChanges()
            migration.applyChanges()
            repeat = SqlMigrator(db, structure=desired)
            repeat.prepareMigrationCommands()
            assert repeat.getChanges() == "", repeat.getChanges()
            actual = SqliteReader({"dbname": path}).get_json_struct("browser", ["main"])
            StructureValidator().validate(actual)
            result[f"v{version}"] = {"desired": desired, "actual": actual, "sql": sql,
                                     "warnings": migration.warnings}
            if version == 1:
                with sqlite3.connect(path) as conn:
                    conn.execute("PRAGMA foreign_keys=ON")
                    conn.execute('INSERT INTO crm_customer (id,name) VALUES (?,?)', ("demo-customer", "Cliente di prova"))
                    conn.execute('INSERT INTO sales_invoice (id,customer_id,amount) VALUES (?,?,?)',
                                 ("demo-invoice", "demo-customer", 42.5))
        with sqlite3.connect(path) as conn:
            assert conn.execute("SELECT name FROM crm_customer").fetchone()[0] == "Cliente di prova"
            assert conn.execute("SELECT amount FROM sales_invoice").fetchone()[0] == 42.5
    return result


if __name__ == "__main__":
    result = sqlite_oracle()
    target = ROOT / "test/fixtures/sqlite.json"
    target.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print("Python SQLite: 2 migrations, empty residual diffs, existing rows preserved.")
