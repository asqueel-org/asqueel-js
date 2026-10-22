"""Independent Python assembly rules, SQL compilation and SQLite round-trip oracle."""
import json, sqlite3, tempfile, sys, re
from datetime import datetime
from pathlib import Path
from python_reference import ROOT
from asqueel import SqlDatabaseConfig, QueryCompiler, resolve_model
from asqueel.adapters.sqlite import SqlDbAdapter
from asqueel.write_compiler import WriteCompiler
from asqueel.environment import SqlEnvironment
from transfer_oracle import snapshot
from assembly_demo import people as demo_people, documents as demo_documents
sys.path.insert(0, str(ROOT/'python'))
from asqueel_transfer import export_transfer, load_transfer


def source():
    b=SqlDatabaseConfig()
    pkg=b.source.db('offline',implementation='sqlite').packages().package('assembly',sqlschema='main')
    p=pkg.table('person',pkey='id')
    for name,dtype in [('id','T'),('name','T'),('weight','L'),('present','B'),('called','B'),('unit','T'),('email','T')]: p.column(name,dtype=dtype)
    p.column('delegate_id',dtype='T').relation('assembly.person.id',relation_name='delegators')
    p.formulaColumn('represented_by',sql_formula='CASE WHEN $present=1 THEN $id WHEN @delegate_id.present=1 THEN $delegate_id ELSE NULL END')
    p.formulaColumn('represented_weight',sql_formula='CASE WHEN $present=1 OR @delegate_id.present=1 THEN $weight ELSE 0 END')
    ballot=pkg.table('ballot',pkey='id')
    for name,dtype in [('id','T'),('title','T'),('closed','B')]: ballot.column(name,dtype=dtype)
    v=pkg.table('vote',pkey='id')
    v.column('id',dtype='T')
    for name,target,inverse in [('ballot_id','ballot','votes'),('person_id','person','votes'),('representative_id','person','represented_votes')]:
        v.column(name,dtype='T').relation(f'assembly.{target}.id',relation_name=inverse)
    v.column('weight',dtype='L');v.column('choice',dtype='T')
    agenda=pkg.table('agenda',pkey='id')
    for name,dtype in [('id','T'),('position','L'),('title','T'),('discussion','T'),('minutes','T'),('completed','B')]: agenda.column(name,dtype=dtype)
    agenda.column('ballot_id',dtype='T').relation('assembly.ballot.id',relation_name='agenda_items')
    doc=pkg.table('document',pkey='id')
    for name,dtype in [('id','T'),('title','T'),('supplier','T'),('total_cents','L'),('filename','T'),('mime','T'),('content','T')]: doc.column(name,dtype=dtype)
    doc.column('agenda_id',dtype='T').relation('assembly.agenda.id',relation_name='documents')
    speech=pkg.table('intervention',pkey='id')
    for name,dtype in [('id','T'),('position','L'),('speaker','T'),('text','T'),('included','B'),('recorded_at','T')]: speech.column(name,dtype=dtype)
    speech.column('agenda_id',dtype='T').relation('assembly.agenda.id',relation_name='interventions')
    speech.column('person_id',dtype='T').relation('assembly.person.id',relation_name='interventions')
    return b


def has_minutes_text(value):
    text=re.sub(r'<(script|style|template)\b[^>]*>[\s\S]*?</\1\s*>','',value,flags=re.I)
    text=re.sub(r'<[^>]*>','',text)
    text=re.sub(r'&(?:nbsp|#0*160|#x0*a0);','',text,flags=re.I)
    return bool(re.sub(r'[\s\u200b\ufeff]','',text))


def initial_bundle():
    people=demo_people()
    agenda=[dict(id=f'a{i+1}',position=i+1,title=title,discussion='',minutes='',completed=False,ballot_id=None) for i,title in enumerate(['Bilancio preventivo','Manutenzione del cortile','Varie ed eventuali','Rinnovo copertura fabbricato','Illuminazione LED delle scale'])]
    return export_transfer(source(),{'assembly.person':people,'assembly.ballot':[],'assembly.vote':[],'assembly.agenda':agenda,'assembly.document':demo_documents(),'assembly.intervention':[]})


READS={
 'interventions':dict(operation='select',table='assembly.intervention',columns='$id,$agenda_id,$person_id,$position,$speaker,$text,$included,$recorded_at',order_by='$agenda_id,$position'),
 'documents':dict(operation='select',table='assembly.document',columns='$id,$agenda_id,$title,$supplier,$total_cents,$filename,$mime,$content',order_by='$id'),
 'agenda':dict(operation='select',table='assembly.agenda',columns='$id,$position,$title,$discussion,$minutes,$completed,$ballot_id',order_by='$position'),
 'people':dict(operation='select',table='assembly.person',columns='$id,$name,$weight,$present,$called,$unit,$email,$delegate_id,$represented_by,$represented_weight',order_by='$unit,$id'),
 'attendance':dict(operation='select',table='assembly.person',columns='SUM($present) AS present,SUM($represented_weight) AS weight,SUM($weight) AS total, SUM(CASE WHEN $represented_weight>0 THEN 1 ELSE 0 END) AS represented'),
 'ballots':dict(operation='select',table='assembly.ballot',columns='$id,$title,$closed',order_by='$id'),
 'votes':dict(operation='select',table='assembly.vote',columns='$id,$ballot_id,$person_id,$representative_id,$weight,$choice',order_by='$id'),
 'voter_groups':dict(operation='select',table='assembly.vote',columns="$ballot_id,$representative_id,COUNT(*) AS represented,SUM($weight) AS weight,SUM(CASE WHEN $person_id<>$representative_id THEN 1 ELSE 0 END) AS delegates,SUM(CASE WHEN $choice IS NULL THEN 1 ELSE 0 END) AS pending",group_by='$ballot_id,$representative_id',order_by='$ballot_id,$representative_id'),
 'totals':dict(operation='select',table='assembly.vote',columns="$ballot_id,COUNT(*) AS represented,SUM($weight) AS weight,SUM(CASE WHEN $choice='yes' THEN $weight ELSE 0 END) AS yes,SUM(CASE WHEN $choice='no' THEN $weight ELSE 0 END) AS no,SUM(CASE WHEN $choice='abstain' THEN $weight ELSE 0 END) AS abstain,SUM(CASE WHEN $choice IS NULL THEN 1 ELSE 0 END) AS pending",group_by='$ballot_id',order_by='$ballot_id')}


class Assembly:
    def __init__(self,builder,con): self.model=resolve_model(builder);self.con=con;self.trace=[]
    def run(self,request):
        options={k:v for k,v in request.items() if k not in ('operation','table')}
        adapter=SqlDbAdapter(None)
        if request['operation']=='select':
            compiled=QueryCompiler(self.model,adapter,environment=SqlEnvironment({})).select(request['table'],**options)
        else:
            values=options.pop('values')
            compiled=getattr(WriteCompiler(adapter),request['operation'])(self.model.table(request['table']),values,{},**options)
        rows=[dict(r) for r in self.con.execute(compiled.sql,dict(compiled.params)).fetchall()]
        self.trace.append(dict(request=request,compiled=dict(sql=compiled.sql,params=dict(compiled.params)),rows=rows))
        return rows
    def view(self):
        result={name:self.run(request) for name,request in READS.items()}
        result['attendance']=result['attendance'][0]
        for ballot in result['ballots']:
            total=next(t for t in result['totals'] if t['ballot_id']==ballot['id'])
            ballot['result']='in_corso' if not ballot['closed'] else ('approvata_demo' if total['yes']*2>total['weight'] else 'respinta_demo')
        return result
    def write(self,table,operation,**values): return self.run(dict(operation=operation,table='assembly.'+table,values=values))
    def action(self,a):
        self.trace=[]
        with self.con:
            state=self.view();people={p['id']:p for p in state['people']}
            active=next((b for b in state['ballots'] if not b['closed']),None)
            kind=a['kind']
            if kind in ('presence','delegate'):
                if active: raise ValueError('VOTAZIONE_APERTA')
                p=people.get(a.get('person'))
                if not p: raise ValueError('PERSONA_SCONOSCIUTA')
                if kind=='presence':
                    if type(a.get('present')) is not bool: raise ValueError('PRESENZA_NON_VALIDA')
                    if a['present'] and p['delegate_id']: raise ValueError('RIMUOVERE_DELEGA')
                    self.write('person','update',id=p['id'],present=a['present'],called=True)
                else:
                    target=a.get('delegate')
                    if target is not None and (p['present'] or target==p['id'] or target not in people or not people[target]['present']): raise ValueError('DELEGA_NON_VALIDA')
                    self.write('person','update',id=p['id'],delegate_id=target,called=True)
            elif kind=='agenda_save':
                current=state['agenda'];base=a.get('base');items=a.get('items')
                if not isinstance(base,list) or len(base)!=len(current) or any(not isinstance(x,dict) or x.get('id')!=y['id'] or x.get('title')!=y['title'] for x,y in zip(base,current)):
                    raise ValueError('AGENDA_MODIFICATA')
                if not isinstance(items,list) or len(items)<len(current) or any(not isinstance(x,dict) or not isinstance(x.get('id'),str) for x in items) or len({x['id'] for x in items})!=len(items):
                    raise ValueError('AGENDA_NON_VALIDA')
                expected={x['id'] for x in current}|{f'a{i+1}' for i in range(len(current),len(items))}
                if any(x['id'] not in expected for x in items): raise ValueError('AGENDA_NON_VALIDA')
                changes=[]
                for position,x in enumerate(items,1):
                    if not isinstance(x.get('title'),str) or not x['title'].strip() or len(x['title'].strip())>120: raise ValueError('TITOLO_NON_VALIDO')
                    title=x['title'].strip();old=next((y for y in current if y['id']==x['id']),None)
                    if old and (old['completed'] or old['ballot_id']) and title!=old['title']: raise ValueError('ARGOMENTO_VOTATO')
                    if active and old and old['position']!=position: raise ValueError('VOTAZIONE_APERTA')
                    changes.append((x['id'],title,position,old))
                for key,title,position,old in changes:
                    if not old: self.write('agenda','insert',id=key,position=position,title=title,discussion='',minutes='',completed=False)
                    elif title!=old['title'] or position!=old['position']: self.write('agenda','update',id=key,position=position,title=title)
            elif kind in ('agenda_add','agenda_edit','agenda_move'):
                if kind=='agenda_add':
                    title=a.get('title','').strip()
                    if not title or len(title)>120: raise ValueError('TITOLO_NON_VALIDO')
                    key=f'a{len(state["agenda"])+1}'
                    if a.get('id')!=key: raise ValueError('PUNTO_NON_VALIDO')
                    self.write('agenda','insert',id=key,position=len(state['agenda'])+1,title=title,discussion='',minutes='',completed=False)
                else:
                    item=next((x for x in state['agenda'] if x['id']==a.get('agenda')),None)
                    if not item: raise ValueError('PUNTO_NON_VALIDO')
                    if kind=='agenda_edit':
                        if item['completed'] or item['ballot_id']: raise ValueError('ARGOMENTO_VOTATO')
                        title=a.get('title','').strip()
                        if not title or len(title)>120: raise ValueError('TITOLO_NON_VALIDO')
                        self.write('agenda','update',id=item['id'],title=title)
                    else:
                        if active: raise ValueError('VOTAZIONE_APERTA')
                        direction=a.get('direction')
                        if type(direction) is not int or direction not in (-1,1): raise ValueError('ORDINE_NON_VALIDO')
                        other=next((x for x in state['agenda'] if x['position']==item['position']+direction),None)
                        if not other: raise ValueError('ORDINE_NON_VALIDO')
                        self.write('agenda','update',id=item['id'],position=other['position'])
                        self.write('agenda','update',id=other['id'],position=item['position'])
            elif kind=='intervention_add':
                item=next((x for x in state['agenda'] if x['id']==a.get('agenda')),None)
                if not item: raise ValueError('PUNTO_NON_VALIDO')
                if item['completed']: raise ValueError('PUNTO_CONCLUSO')
                person=people.get(a.get('person'))
                administrator=a.get('administrator',False)
                if not isinstance(administrator,bool) or (administrator and a.get('person') is not None): raise ValueError('INTERVENTO_NON_VALIDO')
                if not administrator and not person: raise ValueError('PERSONA_SCONOSCIUTA')
                text=a.get('text')
                if not isinstance(text,str) or len(text)>20000 or not has_minutes_text(text): raise ValueError('TESTO_NON_VALIDO')
                if item['discussion']!=a.get('base'): raise ValueError('NOTA_MODIFICATA')
                if a.get('id')!=f'i{len(state["interventions"])+1}': raise ValueError('INTERVENTO_NON_VALIDO')
                recorded=a.get('recorded_at')
                if not isinstance(recorded,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z',recorded): raise ValueError('ORARIO_NON_VALIDO')
                try: datetime.fromisoformat(recorded.replace('Z','+00:00'))
                except ValueError: raise ValueError('ORARIO_NON_VALIDO')
                position=1+sum(x['agenda_id']==item['id'] for x in state['interventions'])
                self.write('intervention','insert',id=a['id'],agenda_id=item['id'],person_id=None if administrator else person['id'],position=position,speaker='Amministratore' if administrator else person['name'],text=text,included=False,recorded_at=recorded)
                self.write('agenda','update',id=item['id'],discussion=text)
            elif kind=='note_save':
                item=next((x for x in state['agenda'] if x['id']==a.get('agenda')),None)
                if not item: raise ValueError('PUNTO_NON_VALIDO')
                if item['completed']: raise ValueError('PUNTO_CONCLUSO')
                field=a.get('field');value=a.get('value');base=a.get('base')
                if field not in ('discussion','minutes') or not isinstance(value,str) or len(value)>20000 or not isinstance(base,str): raise ValueError('TESTO_NON_VALIDO')
                if item[field]!=base: raise ValueError('NOTA_MODIFICATA')
                ids=a.get('interventions',[])
                if not isinstance(ids,list) or any(not isinstance(key,str) for key in ids) or len(set(ids))!=len(ids) or (ids and field!='minutes'): raise ValueError('INTERVENTO_NON_VALIDO')
                rows=[next((x for x in state['interventions'] if x['id']==key and x['agenda_id']==item['id'] and not x['included']),None) for key in ids]
                if any(x is None for x in rows): raise ValueError('INTERVENTO_NON_VALIDO')
                self.write('agenda','update',id=item['id'],**{field:value})
                for row in rows: self.write('intervention','update',id=row['id'],included=True)
            elif kind in ('notes','complete'):
                item=next((x for x in state['agenda'] if x['id']==a.get('agenda')),None)
                if not item: raise ValueError('PUNTO_NON_VALIDO')
                if item['completed']: raise ValueError('PUNTO_CONCLUSO')
                if kind=='notes':
                    if any(not isinstance(a.get(k),str) or len(a[k])>20000 for k in ('discussion','minutes')): raise ValueError('TESTO_NON_VALIDO')
                    self.write('agenda','update',id=item['id'],discussion=a['discussion'],minutes=a['minutes'])
                else:
                    ballot=next((b for b in state['ballots'] if b['id']==item['ballot_id']),None)
                    if ballot and not ballot['closed']: raise ValueError('VOTAZIONE_APERTA')
                    if not has_minutes_text(item['minutes']): raise ValueError('VERBALE_MANCANTE')
                    self.write('agenda','update',id=item['id'],completed=True)
            elif kind=='open':
                if active: raise ValueError('VOTAZIONE_APERTA')
                item=next((x for x in state['agenda'] if x['id']==a.get('agenda')),None)
                if a.get('agenda') and (not item or item['completed'] or item['ballot_id']): raise ValueError('PUNTO_NON_VALIDO')
                title=item['title'] if item else a.get('title','').strip();key=a.get('id','')
                if not title or len(title)>120 or key!=f'b{len(state["ballots"])+1}': raise ValueError('VOTAZIONE_NON_VALIDA')
                voters=[p for p in state['people'] if p['represented_by']]
                if not voters: raise ValueError('NESSUN_RAPPRESENTATO')
                self.write('ballot','insert',id=key,title=title,closed=False)
                if item: self.write('agenda','update',id=item['id'],ballot_id=key)
                for p in voters: self.write('vote','insert',id=key+'_'+p['id'],ballot_id=key,person_id=p['id'],representative_id=p['represented_by'],weight=p['weight'])
            elif kind in ('vote','close'):
                if not active or active['id']!=a.get('ballot'): raise ValueError('VOTAZIONE_NON_APERTA')
                if kind=='vote':
                    v=next((v for v in state['votes'] if v['ballot_id']==active['id'] and v['person_id']==a.get('person')),None)
                    if not v or a.get('choice') not in ('yes','no','abstain'): raise ValueError('VOTO_NON_VALIDO')
                    self.write('vote','update',id=v['id'],choice=a['choice'])
                else:
                    total=next(t for t in state['totals'] if t['ballot_id']==active['id'])
                    if total['pending']: raise ValueError('VOTI_MANCANTI')
                    self.write('ballot','update',id=active['id'],closed=True)
            else: raise ValueError('AZIONE_SCONOSCIUTA')
        return self.view()


def generate():
    bundle=initial_bundle()
    with tempfile.TemporaryDirectory() as folder:
        path=Path(folder)/'assembly.db';builder=load_transfer(bundle,path)
        con=sqlite3.connect(path);con.row_factory=sqlite3.Row;con.execute('PRAGMA foreign_keys=ON')
        app=Assembly(builder,con)
        result=dict(bundle=bundle,before=snapshot(builder,path),initial=app.view(),reads=READS,steps=[])
        for action in json.loads((ROOT/'test/assembly-actions.json').read_text()):
            error=None
            try: view=app.action(action)
            except ValueError as e: error=str(e);app.trace=[];view=app.view()
            result['steps'].append(dict(action=action,error=error,view=view,trace=app.trace.copy()))
        con.close();result['after']=snapshot(builder,path)
        return result


if __name__=='__main__':
    expected=generate()
    if '--verify-return' in sys.argv:
        bundle=json.loads(Path(sys.argv[sys.argv.index('--verify-return')+1]).read_text())
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'returned.db';builder=load_transfer(bundle,path)
            assert snapshot(builder,path)==expected['after'], 'Returned model, migration, catalog or rows differ'
            con=sqlite3.connect(path);con.row_factory=sqlite3.Row
            assert Assembly(builder,con).view()==expected['steps'][-1]['view'], 'Returned calculations differ'
            con.close()
        print('Assembly return accepted by Python: complete structure, records, attendance and ballot calculations')
    else:
        (ROOT/'test/fixtures/assembly.json').write_text(json.dumps(expected,ensure_ascii=False,indent=2)+'\n')
        (ROOT/'examples/assembly-seed.json').write_text(json.dumps({k:expected[k] for k in ('bundle','initial','reads')},ensure_ascii=False,indent=2)+'\n')
        print(f'Python assembly: {len(expected["steps"])} actions exported with SQL, values and calculations')
