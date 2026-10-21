"""Real pinned Python write cycles for hierarchical and automatic counter options."""
import json
from python_reference import ROOT
from asqueel import SqlBuilder, resolve_model, SqlMigrationRenderer
from model_oracle import document
from hooks_oracle import run_case
from hierarchies import declare, handlers, TABLES

def oracle():
    b = SqlBuilder()
    declare(b.source.db('behaviors', implementation='sqlite').packages().package('app', sqlschema='main', sqlprefix=False))
    inputs = json.loads((ROOT / 'test/behaviors-inputs.json').read_text())
    return dict(model=document(resolve_model(b)), desired=SqlMigrationRenderer(b).render(), cases=[dict(name=c['name'], input=c,
        expected=run_case(c, declare, handlers, TABLES, 'behaviors')) for c in inputs])

if __name__ == '__main__':
    result = oracle()
    (ROOT / 'test/fixtures/behaviors.json').write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    print(f'Python: {len(result["cases"])} real hierarchy/counter cases exported')
