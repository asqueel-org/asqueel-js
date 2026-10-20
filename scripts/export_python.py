"""Generate shared grammar, physical contract and independent Python oracles."""
import importlib.metadata
import json
import runpy
import subprocess

from python_reference import ROOT, CORE, MIGRATION

from asqueel import SqlBuilder, SqlMigrationRenderer
from asqueel.common import INDEX_OPTIONS
from asqueel.model_elements import OPTION_LEVELS, SYS_FIELDS, SYS_FIELD_KEYS
from asqueel.option_elements import TABLE_OPTIONS, NAMED_OPTIONS
from asqueel.option_validation import REQUIRED
from asqueel_migration import __version__ as migration_version
from asqueel_migration.structures import COL_JSON_KEYS, DTYPE_CODES, hashed_name


def write(relative, value):
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def main():
    (ROOT / "src/generated").mkdir(parents=True, exist_ok=True)
    SqlBuilder.to_grammar(ROOT / "src/generated/grammar.json")
    write("src/generated/contract.json", {
        "columnKeys": COL_JSON_KEYS, "dtypeCodes": DTYPE_CODES,
        "indexOptions": INDEX_OPTIONS,
        "optionLevels": {name: sorted(levels) for name, levels in OPTION_LEVELS.items()},
        "tableOptions": TABLE_OPTIONS, "namedOptions": NAMED_OPTIONS,
        "requiredOptions": REQUIRED, "sysFields": SYS_FIELDS,
        "sysFieldKeys": sorted(SYS_FIELD_KEYS),
    })
    Shop = runpy.run_path(str(ROOT / "examples/shop.py"))["Shop"]
    model = Shop()
    model.create()
    write("test/fixtures/shop.json", SqlMigrationRenderer(model).render())
    Application = runpy.run_path(str(ROOT / "examples/application.py"))["Application"]
    application = Application()
    application.create()
    write("test/fixtures/application.json", SqlMigrationRenderer(application).render())
    from application_cases import cases, source_document
    corpus = []
    for name, model in cases():
        source = source_document(model)
        expected = SqlMigrationRenderer(model).render()
        corpus.append({"name": name, "source": source, "expected": expected})
    write("test/fixtures/application-cases.json", corpus)
    from sqlite_oracle import sqlite_oracle
    write("test/fixtures/sqlite.json", sqlite_oracle())
    from query_oracle import query_oracle
    write("test/fixtures/queries.json", query_oracle())
    from composition_oracle import composition_oracle
    write("test/fixtures/composition.json", composition_oracle())
    write("test/fixtures/hashes.json", [
        {"schema": s, "table": t, "columns": c, "kind": k,
         "expected": hashed_name(s, t, c, k)}
        for s, t, c in [("public", "invoice", ["id"]),
                         ("città", "fatturazione", ["anno", "numero"]),
                         ("a", "t", ["one", "two"]), ("a", "t", ["two", "one"])]
        for k in ("idx", "fk", "cst")
    ])
    write("test/fixtures/provenance.json", {
        "coreCommit": subprocess.check_output(
            ["git", "-C", str(CORE), "rev-parse", "HEAD"], text=True).strip(),
        "migrationCommit": subprocess.check_output(
            ["git", "-C", str(MIGRATION), "rev-parse", "HEAD"], text=True).strip(),
        "migrationVersion": migration_version,
        "buildersVersion": importlib.metadata.version("genro-builders"),
        "bagVersion": importlib.metadata.version("genro-bag"),
    })
    print(f"Exported grammar, contract, two examples, {len(corpus)} application cases and hash vectors.")


if __name__ == "__main__":
    main()
