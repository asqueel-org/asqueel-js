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

inputs=json.loads((ROOT/'test/model-inputs.json').read_text())
def isolated(case):
    return json.loads(subprocess.check_output([sys.executable,str(ROOT/'scripts/model_oracle.py'),'--case'],input=json.dumps(case),text=True))['expected']
with ThreadPoolExecutor(max_workers=4) as pool:
    expected=list(pool.map(isolated,inputs))
fixtures=json.loads((ROOT/'test/fixtures/resolved-model.json').read_text())
assert expected == [r['expected'] for r in fixtures], 'Checked-in full-model fixtures differ from live Python'
models,sqlite=examples()
example_expected={name:dict(model=document(resolve_model(b)),migration=SqlMigrationRenderer(b).render()) for name,b in models.items()}
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
print('Query SQL fixtures remain regression tests of the previous compiler; query parity with 0.6.1 is the next phase.')
