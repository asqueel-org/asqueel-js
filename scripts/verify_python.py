"""Read-only live verification of the pinned source/migration contract."""
import json
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from python_reference import ROOT,CORE
from asqueel_migration import StructureValidator
from asqueel import AsqueelDb
from asqueel.configuration import compose_recipe, configuration_source
from export_python import examples
from python_model import source_tytx, migration
from query_oracle import query_oracle
from query_features import feature_model
from read_formulas import read_model
from subqueries import subquery_model
from query_macros import macro_model
from query_periods import period_model
from compiler_callbacks import callback_model, callback_methods
from hooks_oracle import oracle as hooks_oracle
from behaviors_oracle import oracle as behaviors_oracle
from cascades_oracle import oracle as cascades_oracle
from import_oracle import oracle as import_oracle

def rows(text):
    """TYTX rows of a recipe source; attribute order is not compared."""
    payload=json.loads(text.removesuffix('::X'))
    return dict(cls=payload.get('__cls'),rows=payload['rows'])
def comparable(value):
    """Replace every recipe source with its rows, recursively."""
    if isinstance(value,dict):return {k:(rows(v) if k=='source' and isinstance(v,str) and v.startswith('{"rows"') else comparable(v)) for k,v in value.items()}
    if isinstance(value,list):return [comparable(v) for v in value]
    return value
def replayed(text):
    """The recipe Python rebuilds from a saved source (AsqueelDb('<file>.tytx'))."""
    with tempfile.TemporaryDirectory(prefix='asqueel-js-source-') as folder:
        path=Path(folder)/'source.tytx';path.write_text(text,encoding='utf-8')
        AsqueelDb(str(path))
        return compose_recipe(configuration_source(str(path)))
def python_reads(text, python_text, expected_migration):
    """A source written by JavaScript loads in Python as the Python source does, with the same migration."""
    recipe=replayed(text)
    assert rows(recipe.source.to_tytx())==rows(replayed(python_text).source.to_tytx()),'JavaScript source loads differently in Python'
    assert recipe.render(mode='migration',foreignKeys=True)==expected_migration,'JavaScript source renders another migration in Python'
inputs=json.loads((ROOT/'test/model-inputs.json').read_text())
def isolated(case):
    return json.loads(subprocess.check_output([sys.executable,str(ROOT/'scripts/model_oracle.py'),'--case'],input=json.dumps(case),text=True))['expected']
with ThreadPoolExecutor(max_workers=4) as pool:
    expected=list(pool.map(isolated,inputs))
fixtures=json.loads((ROOT/'test/fixtures/model-cases.json').read_text())
assert expected == [r['expected'] for r in fixtures], 'Checked-in model fixtures differ from live Python'
models,sqlite=examples()
example_expected={name:dict(source=source_tytx(b),migration=migration(b)) for name,b in models.items()}
queries = {'base': query_oracle(), 'features': query_oracle(feature_model(), 'query-feature-inputs.json'),
           'reads': query_oracle(read_model(), 'read-inputs.json'),
           'subqueries': query_oracle(subquery_model(), 'subquery-inputs.json', 'subquery-errors.json'),
           'callbacks': query_oracle(callback_model(), 'callback-inputs.json', 'callback-errors.json', callback_methods),
           'macros': query_oracle(macro_model(), 'macro-inputs.json', 'macro-errors.json'),
           'periods': query_oracle(period_model(), 'period-inputs.json', 'period-errors.json')}
imports = import_oracle()
assert imports == json.loads((ROOT / 'test/fixtures/imports.json').read_text()), 'Import fixtures differ from live Python'
hooks = hooks_oracle()
behaviors = behaviors_oracle()
cascades = cascades_oracle()
assert cascades == json.loads((ROOT / 'test/fixtures/cascades.json').read_text()), 'Cascade fixtures differ from live Python'
assert behaviors == json.loads((ROOT / 'test/fixtures/behaviors.json').read_text()), 'Behavior fixtures differ from live Python'
assert hooks == json.loads((ROOT / 'test/fixtures/hooks.json').read_text()), 'Hook fixtures differ from live Python'
for name, filename in [('base', 'queries.json'), ('features', 'query-features.json'), ('reads', 'reads.json'), ('subqueries', 'subqueries.json'), ('callbacks', 'callbacks.json'), ('macros', 'macros.json'), ('periods', 'periods.json')]:
    assert queries[name] == json.loads((ROOT / 'test/fixtures' / filename).read_text()), f'{filename} differs from live Python'
for runtime in ('node','bun'):
    rendered=json.loads(subprocess.check_output([runtime,str(ROOT/'scripts/render_models.js')],cwd=ROOT,text=True))
    assert comparable(rendered['cases'])==comparable(expected), f'{runtime}: composed source or migration differs from live Python'
    assert comparable(rendered['examples'])==comparable(example_expected),f'{runtime}: independently authored examples differ from live Python'
    for r, python in [*zip(rendered['cases'], expected), *((rendered['examples'][k], v) for k, v in example_expected.items())]:
        if 'migration' in r and r.get('modelAccepted', True):
            python_reads(r['source'], python['source'], r['migration'])
    for r in rendered['cases']:
        if 'migration' in r:StructureValidator().validate(r['migration'])
    for r in rendered['examples'].values():StructureValidator().validate(r['migration'])
    actual=json.loads(subprocess.check_output([runtime,str(ROOT/'scripts/render_sqlite.js')],cwd=ROOT,text=True))
    assert actual=={n:{k:s[k] for k in ('desired','actual')} for n,s in sqlite.items()},f'{runtime}: SQLite migration/catalog differs'
    print(f'{runtime}: {len(expected)} source/migrate cases, {len(models)} independently authored examples, 2 real SQLite migrations match Python; every JavaScript source loads in Python')
    actual=json.loads(subprocess.check_output([runtime,str(ROOT/'scripts/render_queries.js')],cwd=ROOT,text=True))
    assert comparable(actual) == comparable(queries), f'{runtime}: query source, SQL, parameters or SQLite results differ from live Python'
    print(f'{runtime}: {sum(len(q["cases"]) for q in queries.values())} query/CRUD cases match live Python SQL, parameters and SQLite results')
    actual=json.loads(subprocess.check_output([runtime,str(ROOT/'scripts/render_hooks.js')],cwd=ROOT,text=True))
    assert comparable(actual) == comparable(hooks), f'{runtime}: application write cycle differs from live Python'
    print(f'{runtime}: {len(hooks["cases"])} sys_fields/hook cycles match live Python records, events, DML, rollback and stored rows')
    actual=json.loads(subprocess.check_output([runtime,str(ROOT/'scripts/render_behaviors.js')],cwd=ROOT,text=True))
    assert comparable(actual) == comparable(behaviors), f'{runtime}: hierarchy/counter cycle differs from live Python'
    print(f'{runtime}: {len(behaviors["cases"])} hierarchy/counter cycles match live Python model, migrate, records, events, DML and stored rows')
    actual=json.loads(subprocess.check_output([runtime,str(ROOT/'scripts/render_cascades.js')],cwd=ROOT,text=True))
    assert comparable(actual) == comparable(cascades), f'{runtime}: application onUpdate differs from live Python'
    print(f'{runtime}: {len(cascades["cases"])} onUpdate cycles match live Python model, migrate, records, events, DML and stored rows')

    actual=json.loads(subprocess.check_output([runtime,str(ROOT/'scripts/render_imports.js')],cwd=ROOT,text=True))
    # JSON.stringify emits some SQLite REAL doubles as integer tokens (e.g. 1.23e19).
    # Restore only the cells whose Python SQLite result is already a float.
    # Decimal binding strings, INTEGER cells, input data and SQL remain exact.
    for found, reference in zip(actual['cases'], imports['cases']):
        for row, expected_row in zip(found['expected']['rows'], reference['expected']['rows']):
            for key, expected_value in expected_row.items():
                if isinstance(expected_value, float) and isinstance(row.get(key), (int, float)):
                    row[key] = float(row[key])
    assert comparable(actual) == comparable(imports), f'{runtime}: file import SQL, parameters, results or rollback differ from live Python'
    print(f'{runtime}: {len(imports["cases"])} CSV/JSON/TYTX imports match live Python SQL, parameters, rows and rollback')

from verify_transfers import verify as verify_transfers
verify_transfers()

from assembly_oracle import generate as assembly_oracle
assembly = assembly_oracle()
assert assembly == json.loads((ROOT/'test/fixtures/assembly.json').read_text()), 'Assembly fixtures differ from live Python'
assert {k:assembly[k] for k in ('bundle','initial','reads')} == json.loads((ROOT/'examples/assembly-seed.json').read_text()), 'Assembly seed differs from live Python'
print(f'Assembly: {len(assembly["steps"])} actions, SQL and calculations match live Python')
