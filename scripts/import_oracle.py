"""Real Python sql_insert file/list calls and SQLite execution, with unmodified reference."""
import json, re, sqlite3, tempfile
from pathlib import Path
from io import StringIO
from copy import deepcopy
from datetime import date, time, datetime
from decimal import Decimal
from python_reference import ROOT
from asqueel import AsqueelDb, SqlBuilder, SqlDatabaseConfig
from import_records import declare, ImportTable, CLASSES
from python_model import bind_table_classes, migration, source_tytx

def normalize(value):
    if isinstance(value, (date,time,datetime)):return value.isoformat()
    if isinstance(value,Decimal):return str(value)
    if isinstance(value,dict):return {k:normalize(v) for k,v in value.items()}
    if isinstance(value,(list,tuple)):return [normalize(v) for v in value]
    return value

def source(case):
    if not case.get('generate'):return deepcopy(case['source'])
    rows=[dict(id=i,name=f'item {i}') for i in range(1,case['generate']+1)]
    if case.get('late_error'):rows[-1]['stock']='bad'
    if case['format']=='json':return json.dumps(rows)
    if case['format']=='csv':return 'id,name\n'+''.join(f'{r["id"]},{r["name"]}\n' for r in rows)
    return ''.join(json.dumps(r)+'::JS\n' for r in rows)

def run(case):
    events=[]; ImportTable.events=events
    with tempfile.TemporaryDirectory(prefix='asqueel-import-') as folder:
        path=str(Path(folder)/'test.db'); config=SqlDatabaseConfig()
        root=config.source.db('imports',implementation='sqlite');root.connection('main',database=path)
        declare(root.packages().package('app',sqlschema='main',sqlprefix=False))
        db=AsqueelDb(config).session();bind_table_classes(db,CLASSES)
        try:
            db.migrate();db.commit();table=db.table('app.'+case.get('table','item'))
            if case.get('setup'):table.sql_insert(deepcopy(case['setup']));db.commit()
            statements=[];execute=db.execute;many=db.executemany
            def capture(query,params):
                if query.sql.startswith('INSERT'):
                    keys=set(re.findall(r':([A-Za-z_]\w*)',query.sql))
                    statements.append(dict(sql=query.sql,params={k:int(v) if isinstance(v,bool) else normalize(v) for k,v in params.items() if k in keys}))
            def traced(query,*args,**kwargs):
                capture(query,query.params);return execute(query,*args,**kwargs)
            def traced_many(query,params,*args,**kwargs):
                params=list(params)
                for row in params:capture(query,row)
                return many(query,params,*args,**kwargs)
            db.execute=traced;db.executemany=traced_many
            data=source(case)
            if case.get('kind')!='records':
                data=StringIO(data)
                if 'filename' in case:data.name=case['filename']
            options={k:case[k] for k in ['format','adapt'] if k in case}
            failed=False;result=None;error=None
            try:result=table.sql_insert(data,**options);db.commit()
            except Exception as exc:failed=True;error=str(exc);db.rollback()
            assert failed==case.get('fails',False),f'{case["name"]}: {error or "unexpected success"}'
            with sqlite3.connect(path) as con:
                con.row_factory=sqlite3.Row
                rows=[dict(r) for r in con.execute(f'SELECT * FROM "{case.get("table","item")}" ORDER BY id')]
            return dict(failed=failed,result=normalize(result),statements=statements,events=events,rows=rows)
        finally:db.close()

def oracle():
    b=SqlBuilder();declare(b.source.db('imports',implementation='sqlite').packages().package('app',sqlschema='main',sqlprefix=False))
    inputs=json.loads((ROOT/'test/import-inputs.json').read_text())
    return dict(source=source_tytx(b),desired=migration(b),cases=[dict(name=c['name'],input=c,expected=run(c)) for c in inputs])
if __name__=='__main__':
    data=oracle();(ROOT/'test/fixtures/imports.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');print(f'Python: {len(data["cases"])} import cases verified')
