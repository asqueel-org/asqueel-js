"""Real pinned Python write cycles for application onUpdate cascades."""
import json
from python_reference import ROOT
from asqueel import SqlBuilder, resolve_model, SqlMigrationRenderer
from model_oracle import document
from hooks_oracle import run_case
from update_cascades import declare, handlers, TABLES

def oracle():
    b = SqlBuilder()
    declare(b.source.db('cascades', implementation='sqlite').packages().package('app', sqlschema='main', sqlprefix=False))
    inputs = json.loads((ROOT / 'test/cascades-inputs.json').read_text())
    return dict(model=document(resolve_model(b)), desired=SqlMigrationRenderer(b).render(), cases=[dict(name=c['name'], input=c,
        expected=run_case(c, declare, handlers, TABLES, 'cascades')) for c in inputs])

if __name__ == '__main__':
    result = oracle()
    (ROOT / 'test/fixtures/cascades.json').write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    print(f'Python: {len(result["cases"])} real onUpdate cascade cases exported')
