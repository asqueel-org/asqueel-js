"""Read-only live parity check against the real renderer and migration validator."""
import json
import runpy
import subprocess

from python_reference import ROOT

from asqueel import SqlMigrationRenderer
from asqueel_migration import StructureValidator

Shop = runpy.run_path(str(ROOT / "examples/shop.py"))["Shop"]
model = Shop()
model.create()
expected = {"shop": SqlMigrationRenderer(model).render()}
Application = runpy.run_path(str(ROOT / "examples/application.py"))["Application"]
application = Application()
application.create()
expected["application"] = SqlMigrationRenderer(application).render()
from application_cases import cases
for name, model in cases():
    expected[name] = SqlMigrationRenderer(model).render()
from sqlite_oracle import sqlite_oracle
from query_oracle import query_oracle
from composition_oracle import composition_oracle
composition_expected = [dict(name=case['name'], result=case['expected']) for case in composition_oracle()]
queries_expected = query_oracle()
sqlite_expected = {name: {key: stage[key] for key in ("desired", "actual")}
                   for name, stage in sqlite_oracle().items()}
for runtime in ("node", "bun"):
    composed = json.loads(subprocess.check_output(
        [runtime, str(ROOT / "scripts/render_composition.js")], cwd=ROOT, text=True))
    assert composed == composition_expected, f"{runtime}: composition source or migration differs from live Python"
    print(f"{runtime}: {len(composed)} composition cases match Python source, conflicts and migration")
    rendered = json.loads(subprocess.check_output(
        [runtime, str(ROOT / "scripts/render_cases.js")], cwd=ROOT, text=True))
    assert rendered == expected, f"{runtime}: output differs from the current Python renderer"
    for name, structure in rendered.items():
        assert StructureValidator().validate(structure) == expected[name], name
    print(f"{runtime}: {len(rendered)} exact Python matches, all accepted by StructureValidator")
    sqlite_rendered = json.loads(subprocess.check_output(
        [runtime, str(ROOT / "scripts/render_sqlite.js")], cwd=ROOT, text=True))
    assert sqlite_rendered == sqlite_expected, f"{runtime}: SQLite migrations differ from live Python"
    for stage in sqlite_rendered.values():
        StructureValidator().validate(stage["actual"])
    print(f"{runtime}: 2 SQLite migration stages, models and live catalogs equal Python, residual diffs empty")
    queries_rendered = json.loads(subprocess.check_output(
        [runtime, str(ROOT / "scripts/render_queries.js")], cwd=ROOT, text=True))
    assert queries_rendered == queries_expected, f"{runtime}: query SQL, parameters or rows differ from live Python"
    print(f"{runtime}: {len(queries_rendered['cases'])} queries match live Python SQL, parameters and SQLite results")
