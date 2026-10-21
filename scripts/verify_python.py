"""Read-only live verification of the pinned model/migration contract."""
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from python_reference import ROOT,CORE
from asqueel_migration import StructureValidator
from export_python import examples
from model_oracle import document
from asqueel import resolve_model,SqlMigrationRenderer
from query_oracle import query_oracle
from query_features import feature_model
from read_formulas import read_model
from subqueries import subquery_model
from hooks_oracle import oracle as hooks_oracle
from behaviors_oracle import oracle as behaviors_oracle
from cascades_oracle import oracle as cascades_oracle

inputs=json.loads((ROOT/'test/model-inputs.json').read_text())
def isolated(case):
    return json.loads(subprocess.check_output([sys.executable,str(ROOT/'scripts/model_oracle.py'),'--case'],input=json.dumps(case),text=True))['expected']
with ThreadPoolExecutor(max_workers=4) as pool:
    expected=list(pool.map(isolated,inputs))
fixtures=json.loads((ROOT/'test/fixtures/resolved-model.json').read_text())
assert expected == [r['expected'] for r in fixtures], 'Checked-in full-model fixtures differ from live Python'
models,sqlite=examples()
example_expected={name:dict(model=document(resolve_model(b)),migration=SqlMigrationRenderer(b).render()) for name,b in models.items()}
queries = {'base': query_oracle(), 'features': query_oracle(feature_model(), 'query-feature-inputs.json'),
           'reads': query_oracle(read_model(), 'read-inputs.json'),
           'subqueries': query_oracle(subquery_model(), 'subquery-inputs.json', 'subquery-errors.json')}
hooks = hooks_oracle()
behaviors = behaviors_oracle()
cascades = cascades_oracle()
assert cascades == json.loads((ROOT / 'test/fixtures/cascades.json').read_text()), 'Cascade fixtures differ from live Python'
assert behaviors == json.loads((ROOT / 'test/fixtures/behaviors.json').read_text()), 'Behavior fixtures differ from live Python'
assert hooks == json.loads((ROOT / 'test/fixtures/hooks.json').read_text()), 'Hook fixtures differ from live Python'
for name, filename in [('base', 'queries.json'), ('features', 'query-features.json'), ('reads', 'reads.json'), ('subqueries', 'subqueries.json')]:
    assert queries[name] == json.loads((ROOT / 'test/fixtures' / filename).read_text()), f'{filename} differs from live Python'
for runtime in ('node','bun'):
    rendered=json.loads(subprocess.check_output([runtime,str(ROOT/'scripts/render_models.js')],cwd=ROOT,text=True))
    assert rendered['cases']==expected, f'{runtime}: complete model or migration differs from live Python'
    assert rendered['examples']==example_expected,f'{runtime}: independently authored examples differ from live Python'
    for r in rendered['cases']:
        if 'migration' in r:StructureValidator().validate(r['migration'])
    for r in rendered['examples'].values():StructureValidator().validate(r['migration'])
    actual=json.loads(subprocess.check_output([runtime,str(ROOT/'scripts/render_sqlite.js')],cwd=ROOT,text=True))
    assert actual=={n:{k:s[k] for k in ('desired','actual')} for n,s in sqlite.items()},f'{runtime}: SQLite migration/catalog differs'
    print(f'{runtime}: {len(expected)} complete-model/migrate cases, {len(models)} independently authored examples, 2 real SQLite migrations match Python 0.6.1')
    actual=json.loads(subprocess.check_output([runtime,str(ROOT/'scripts/render_queries.js')],cwd=ROOT,text=True))
    assert actual == queries, f'{runtime}: query model, SQL, parameters or SQLite results differ from live Python'
    print(f'{runtime}: {sum(len(q["cases"]) for q in queries.values())} query/CRUD cases match live Python SQL, parameters and SQLite results')
    actual=json.loads(subprocess.check_output([runtime,str(ROOT/'scripts/render_hooks.js')],cwd=ROOT,text=True))
    assert actual == hooks, f'{runtime}: application write cycle differs from live Python'
    print(f'{runtime}: {len(hooks["cases"])} sys_fields/hook cycles match live Python records, events, DML, rollback and stored rows')
    actual=json.loads(subprocess.check_output([runtime,str(ROOT/'scripts/render_behaviors.js')],cwd=ROOT,text=True))
    assert actual == behaviors, f'{runtime}: hierarchy/counter cycle differs from live Python'
    print(f'{runtime}: {len(behaviors["cases"])} hierarchy/counter cycles match live Python model, migrate, records, events, DML and stored rows')
    actual=json.loads(subprocess.check_output([runtime,str(ROOT/'scripts/render_cascades.js')],cwd=ROOT,text=True))
    assert actual == cascades, f'{runtime}: application onUpdate differs from live Python'
    print(f'{runtime}: {len(cascades["cases"])} onUpdate cycles match live Python model, migrate, records, events, DML and stored rows')
