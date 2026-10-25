"""Export the pinned grammar, contract, example sources (TYTX) and migration JSON."""
import json
import runpy
from python_reference import ROOT
from asqueel import SqlBuilder,SqlDatabaseConfig
from asqueel.common import INDEX_OPTIONS
from asqueel.model_elements import OPTION_LEVELS,SYS_FIELDS,SYS_FIELD_KEYS
from asqueel.option_elements import NAMED_OPTIONS
from asqueel.option_validation import REQUIRED
from asqueel_migration.structures import COL_JSON_KEYS,DTYPE_CODES
from model_oracle import main as export_models
from python_model import source_tytx,migration

def write(path,value):
    (ROOT/path).write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n')

def examples():
    result={}
    for name,cls in [('shop','Shop'),('application','Application')]:
        b=runpy.run_path(str(ROOT/f'examples/{name}.py'))[cls]();b.create();result[name]=b
    features=runpy.run_path(str(ROOT/'examples/model_features.py'))
    result['groups']=features['grouped_items']();result['virtual-relations']=features['virtual_relations']()
    query=runpy.run_path(str(ROOT/'examples/browser_queries.py'))['query_model']();result['queries']=query
    from sqlite_oracle import sqlite_oracle
    return result,sqlite_oracle()

def main():
    SqlBuilder.to_grammar(ROOT/'src/generated/grammar.json');SqlDatabaseConfig.to_grammar(ROOT/'src/generated/configuration-grammar.json');b=SqlBuilder()
    write('src/generated/contract.json',dict(columnKeys=COL_JSON_KEYS,dtypeCodes=DTYPE_CODES,indexOptions=INDEX_OPTIONS,
        optionLevels={tag:sorted(b.option_levels(tag)) for tag in sorted(OPTION_LEVELS.keys()|b.table_options)},tableOptions=sorted(b.table_options),namedOptions=NAMED_OPTIONS,
        requiredOptions=REQUIRED,sysFields=SYS_FIELDS,sysFieldKeys=sorted(SYS_FIELD_KEYS)))
    models,sqlite=examples()
    for name,b in models.items():
        write(f'test/fixtures/{name}.json',migration(b)) if name in ('shop','application') else None
    write('test/fixtures/model-examples.json',{name:dict(source=source_tytx(b),migration=migration(b)) for name,b in models.items()})
    write('test/fixtures/sqlite.json',sqlite)
    export_models()
    print('Exported the Python grammar, contract, 5 example sources with their migration JSON and 2 real SQLite migrations.')
if __name__=='__main__':main()
