"""Full, unfiltered hierarchical snapshots from the pinned Python release.

The old model_to_json encodes ResolvedModel, not 0.6.1's DbModel. This codec
walks every object and every global relation; it never copies expected JS data.
"""
import json
import sys
import subprocess
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from python_reference import ROOT
from asqueel import SqlBuilder, SqlDatabaseConfig, resolve_model, SqlMigrationRenderer
from asqueel.configuration import _owned_handler
from asqueel.model_sections import thaw
from asqueel_migration.exceptions import SqlValidationError


def document(model):
    def tree(n):
        meta = n.structnode.attr.get('_meta', {}) if n.structnode is not None else {}
        return dict(name=n.name, tag=n.tag, attributes=thaw(n.attributes),
                    children=[tree(c) for c in n.values()],
                    signatureDefaults=meta.get('signature_defaults', []) if n.tag == 'aliasColumn' else [], generated=n.structnode is None)
    edges = [dict(path=f'{p.label}.{t.label}.{r.label}', attributes=thaw(dict(r.attr)))
             for p in model.relations for t in p.value for r in t.value]
    return dict(format='asqueel-model', version=1, reference='0.6.1',
                database=tree(model.db), namespaces=tree(model.obj), relations=edges)


def apply(builder, steps):
    outcomes=[]
    for s in steps:
        try:
            with builder.contribution(s.get('contribution','main')):
                parent=builder.source[s['parent']] if s['parent'] else builder.source
                getattr(parent,s['tag'])(**deepcopy(s['attributes']))
            outcomes.append(True)
        except (ValueError,TypeError,AttributeError,KeyError):
            outcomes.append(False)
    return outcomes


def evaluate(case, diagnostics=None):
    layers=[]; outcomes=[]
    for steps in case['layers']:
        b=(SqlDatabaseConfig if case.get('configuration') else SqlBuilder)()
        for key,value in case.get('data',{}).items(): b.data.set_item(key,deepcopy(value))
        outcomes.append(apply(b,steps));layers.append(b)
    result=dict(outcomes=outcomes)
    try:
        if case['mode']=='clone':
            b=deepcopy(layers[0]);outcomes.append(apply(b,case['after']))
        elif case['mode'] in ('layers','recompose'):
            b=_owned_handler(layers[-1],layers[:-1]).builder
            if case['mode']=='recompose':b=_owned_handler(b,[layers[0]]).builder
        else:b=layers[0]
        result['compositionAccepted']=True
    except (ValueError,TypeError,AttributeError,KeyError,SqlValidationError) as e:
        result['compositionAccepted']=False
        if diagnostics is not None:diagnostics['composition']=str(e)
        return result
    for key,render in [('model',lambda:document(resolve_model(b))),('migration',lambda:SqlMigrationRenderer(b).render())]:
        try:
            result[key]=render()
        except (ValueError,TypeError,AttributeError,KeyError,SqlValidationError) as e:
            result[key+'Accepted']=False
            if diagnostics is not None:diagnostics[key]=str(e)
    return result


def main():
    inputs=json.loads((ROOT/'test/model-inputs.json').read_text())
    results=[];diagnostics={}
    def isolated(case):
        return json.loads(subprocess.check_output([sys.executable,__file__,'--case'],input=json.dumps(case),text=True))
    with ThreadPoolExecutor(max_workers=4) as pool:
        outputs=list(pool.map(isolated,inputs))
    for case,output in zip(inputs,outputs):
        expected,diag=output['expected'],output['diagnostics']
        results.append(dict(name=case['name'],expected=expected))
        if diag:diagnostics[case['name']]=diag
    (ROOT/'test/fixtures/resolved-model.json').write_text(json.dumps(results,indent=2,ensure_ascii=False)+'\n')
    (ROOT/'test/fixtures/model-rejections.json').write_text(json.dumps(diagnostics,indent=2,ensure_ascii=False)+'\n')
    print(f'{len(results)} cases: {sum("model" in r["expected"] for r in results)} full models, {sum("migration" in r["expected"] for r in results)} migration documents')
if __name__=='__main__':
    if '--case' in sys.argv:
        diag={};expected=evaluate(json.load(sys.stdin),diag)
        print(json.dumps(dict(expected=expected,diagnostics=diag)))
    else:main()
