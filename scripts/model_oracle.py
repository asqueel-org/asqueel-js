"""Model corpus oracle: composed source in TYTX, migration JSON and acceptance outcomes."""
import json
import sys
import subprocess
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from python_reference import ROOT
from asqueel import AsqueelDb, SqlBuilder, SqlDatabaseConfig
from asqueel.configuration import compose_recipe
from asqueel_migration.exceptions import SqlValidationError

REJECTIONS = (ValueError, TypeError, AttributeError, KeyError, SqlValidationError)


def apply(builder, steps):
    outcomes=[]
    for s in steps:
        try:
            with builder.contribution(s.get('contribution','main')):
                parent=builder.source[s['parent']] if s['parent'] else builder.source
                getattr(parent,s['tag'])(**deepcopy(s['attributes']))
            outcomes.append(True)
        except REJECTIONS:
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
            recipe=compose_recipe(b)
        elif case['mode'] in ('layers','recompose'):
            recipe=compose_recipe(layers[-1],layers[:-1])
            if case['mode']=='recompose':recipe=compose_recipe(recipe,[layers[0]])
        else:recipe=compose_recipe(layers[0])
        result['compositionAccepted']=True
    except REJECTIONS as e:
        result['compositionAccepted']=False
        if diagnostics is not None:diagnostics['composition']=str(e)
        return result
    result['source']=recipe.source.to_tytx()
    for key,render in [('model',lambda:AsqueelDb(recipe) and True),
                       ('migration',lambda:recipe.render(mode='migration',foreignKeys=True))]:
        try:
            value=render()
            if key=='migration':result[key]=value
            else:result['modelAccepted']=True
        except REJECTIONS as e:
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
    (ROOT/'test/fixtures/model-cases.json').write_text(json.dumps(results,indent=2,ensure_ascii=False)+'\n')
    (ROOT/'test/fixtures/model-rejections.json').write_text(json.dumps(diagnostics,indent=2,ensure_ascii=False)+'\n')
    print(f'{len(results)} cases: {sum("source" in r["expected"] for r in results)} composed sources, {sum("migration" in r["expected"] for r in results)} migration documents')
if __name__=='__main__':
    if '--case' in sys.argv:
        diag={};expected=evaluate(json.load(sys.stdin),diag)
        print(json.dumps(dict(expected=expected,diagnostics=diag)))
    else:main()
