"""Python source -> TYTX -> SQLite oracle; also accepts actual browser return bundles."""
import json, sys, tempfile, sqlite3
from pathlib import Path
from datetime import date, datetime, time
from decimal import Decimal
from python_reference import ROOT
sys.path.insert(0, str(ROOT / 'python'))
from asqueel_transfer import export_transfer, load_transfer, read_transfer, quote, bag_wire
from asqueel import SqlDatabaseConfig, SqlMigrationRenderer, resolve_model
from asqueel_migration.readers.sqlite_reader import SqliteReader
from model_oracle import document
from genro_bag import Bag
from genro_tytx import from_tytx


def declaration():
    b = SqlDatabaseConfig()
    db = b.source.db('offline', implementation='postgres')
    db.connection('main', database='server-only', password='never-send-this')
    pkg = db.packages().package('work', sqlschema='work')
    doc = pkg.table('document', pkey='id')
    doc.column('id', dtype='T')
    doc.column('title', dtype='T', sqlname='doc_title', sql_default="'default'")
    doc.column('active', dtype='B')
    doc.column('day', dtype='D')
    doc.column('moment', dtype='DHZ')
    doc.column('time', dtype='H')
    doc.column('amount', dtype='N', size='12,2')
    doc.formulaColumn('caption', sql_formula='$title')
    line = pkg.table('line', pkey='id')
    line.column('id', dtype='T')
    line.column('document_id', dtype='T').relation('work.document.id', relation_name='lines', onDelete_sql='cascade')
    line.column('description', dtype='T')
    line.column('quantity', dtype='L')
    pkg.table('unused', pkey='id').column('id', dtype='T')
    db.packages().package('catalog', sqlschema='catalog').table('item', pkey='id').column('id', dtype='T')
    return b


def records():
    # Deliberately child before parent: deferred FK check applies across the snapshot.
    return {'work.line': [dict(id='l1', document_id='d1', description='caffè ☕\nseconda riga', quantity=2)],
            'work.document': [dict(id='d1', title='2026-01-01::D', active=True, day=date(2026,10,21),
                                   moment=datetime.fromisoformat('2026-10-21T10:11:12.123456+02:00'),
                                   time=time(12,30,15,123456), amount=Decimal('12.50')),
                              dict(id='d2', title=None, active=False, day=None, moment=None, time=None, amount=None)]}


def rich_bag():
    bag=Bag()
    bag.set_item('title','caffè ☕ & <xml> ::D',_attributes={'caption':'2026-01-01::D','enabled':False,'null':None},_remove_null_attributes=False,node_tag='field')
    nested=Bag()
    nested.set_item('when',datetime.fromisoformat('2026-10-21T10:11:12.123456+02:00'),
                    _attributes={'date':date(2026,10,21),'amount':Decimal('12.50')},node_tag='timestamp')
    nested.set_item('amount',Decimal('123.4500'))
    nested.set_item('time',time(12,30,15,123456))
    nested.set_item('binary',bytes(range(256)))
    nested.set_item('object',{'text':'::NN','list':[None,False,0,Decimal('1.25')]})
    nested.set_item('empty',Bag())
    nested.set_item('nil',None)
    bag.set_item('nested',nested,_attributes={'extra':{'key':'value::X'}})
    bag.set_item('first',1,node_tag='field');bag.set_item('second',2,node_tag='field')
    return bag


def binary_model():
    b=SqlDatabaseConfig();t=b.source.db('offline',implementation='sqlite').packages().package('files',sqlschema='main').table('asset',pkey='id')
    t.column('id',dtype='T');t.column('payload',dtype='X');t.column('binary',dtype='O')
    return b


def canonical_wire(value):
    if isinstance(value,str):
        if value.endswith('::T'): return value[:-3]
        if value=='::NN': return None
        if value.endswith('::JS'): return canonical_wire(json.loads(value[:-4]))
    if isinstance(value,list): return [canonical_wire(v) for v in value]
    if isinstance(value,dict): return {k:canonical_wire(v) for k,v in value.items()}
    return value


def normalized_bag(text): return canonical_wire(json.loads(text[:-3].removesuffix('::JS')))


def snapshot(builder, path):
    model = resolve_model(builder)
    with sqlite3.connect(path) as con:
        con.row_factory = sqlite3.Row
        rows = {name: [dict(r) for r in con.execute(f'SELECT * FROM {quote(t.sqlname)} ORDER BY {quote(t.columns[t.attributes["pkey"]].sqlname)}')]
                for name, t in model.tables.items()}
    for name, table in model.tables.items():
        for row in rows[name]:
            for col in table.columns.values():
                value=row[col.sqlname]
                if value is not None and col.attributes['dtype']=='X': row[col.sqlname]={'bag':normalized_bag(value)}
                if value is not None and col.attributes['dtype']=='O': row[col.sqlname]={'hex':bytes(value).hex()}
    return dict(model=document(model), migration=SqlMigrationRenderer(builder).render(),
                structure=SqliteReader({'dbname': str(path)}).get_json_struct('offline', ['main']), rows=rows)


def evaluate(bundle, edit=False):
    with tempfile.TemporaryDirectory(prefix='asqueel-transfer-') as folder:
        path = Path(folder)/'db.sqlite'
        builder = load_transfer(bundle, path)
        if edit:
            with sqlite3.connect(path) as con:
                if 'work.document' in resolve_model(builder).tables:
                    con.execute('UPDATE work_document SET doc_title=? WHERE id=?', ('Modificato offline', 'd1'))
                    con.execute('INSERT INTO work_line (id, document_id, description, quantity) VALUES (?,?,?,?)', ('l2','d1','Nuova riga offline',3))
                if 'files.asset' in resolve_model(builder).tables:
                    edited=Bag();edited.set_item('edited','Scritto nel browser',_attributes={'active':True},node_tag='field')
                    con.execute('UPDATE files_asset SET payload=?, binary=? WHERE id=?',(bag_wire(edited),bytes([255,0,128,1]),'edited'))
        return snapshot(builder, path)


def oracle():
    builder = declaration(); data = records()
    cases = []
    for name, selection in [('full', {}), ('tables', {'tables':['work.document','work.line']}),
                            ('package', {'packages':['work']}), ('empty_data', {'tables':['catalog.item']})]:
        bundle = export_transfer(builder, {} if name == 'empty_data' else data, **selection)
        assert 'never-send-this' not in json.dumps(bundle)
        cases.append(dict(name=name, bundle=bundle, before=evaluate(bundle), after=evaluate(bundle, edit=True)))
    from model_features import grouped_items, virtual_relations
    for name, model in [('colgroups', grouped_items()), ('virtual_relations', virtual_relations())]:
        bundle=export_transfer(model,{})
        cases.append(dict(name=name,bundle=bundle,before=evaluate(bundle),after=evaluate(bundle)))
    sys = SqlDatabaseConfig()
    packages=sys.source.db('offline',implementation='sqlite').packages()
    packages.package('empty',sqlschema='main')
    pkg=packages.package('app',sqlschema='main'); pkg.options().requires('empty')
    t=pkg.table('item')
    t.options().sys_fields()
    t.column('title',dtype='T')
    bundle=export_transfer(sys,{})
    cases.append(dict(name='sys_fields',bundle=bundle,before=evaluate(bundle),after=evaluate(bundle)))
    try: export_transfer(sys,{},tables=['app.item'])
    except ValueError: pass
    else: raise AssertionError('Missing required package accepted')
    # Compare with the original Python values, not only with already encoded data.
    first=cases[0]['before']['rows']['work.document'][0]
    original=records()['work.document'][0]
    assert first['moment']==original['moment'].isoformat()
    assert first['time']==original['time'].isoformat()
    assert first['doc_title']==original['title']
    for kwargs in [dict(tables=['unknown.table']),dict(packages=['unknown'])]:
        try: export_transfer(builder,{},**kwargs)
        except ValueError: pass
        else: raise AssertionError('Unknown selection was accepted')
    collision=SqlDatabaseConfig(); packages=collision.source.db('collision',implementation='postgres').packages()
    for name in ['a','b']:
        packages.package(name,sqlschema=name,sqlprefix=False).table('item',pkey='id').column('id',dtype='T')
    try: export_transfer(collision,{})
    except ValueError: pass
    else: raise AssertionError('SQLite schema flattening collision accepted')
    assert resolve_model(builder).implementation=='postgres', 'Export changed the original builder'
    try: export_transfer(builder, {}, tables=['work.line'])
    except (ValueError, KeyError): pass
    else: raise AssertionError('Partial source must reject missing relation targets')
    rich=rich_bag()
    transferred=from_tytx(bag_wire(rich))
    assert transferred['nested.when']==rich['nested.when']
    assert transferred['nested.time']==rich['nested.time']
    assert transferred['nested.amount']==rich['nested.amount']
    assert transferred['nested.binary']==bytes(range(256))
    assert [n.label for n in transferred]==[n.label for n in rich]
    data={'files.asset':[dict(id='rich',payload=rich,binary=bytes(range(256))),
                         dict(id='empty',payload=Bag(),binary=b''),dict(id='null',payload=None,binary=None),
                         dict(id='edited',payload=Bag({'before':'originale'}),binary=b'old')]}
    bundle=export_transfer(binary_model(),data)
    cases.append(dict(name='bags_blobs',bundle=bundle,before=evaluate(bundle),after=evaluate(bundle,edit=True)))
    original=json.loads(bundle['data']['files.asset'].splitlines()[0][:-4])
    for case in json.loads((ROOT/'test/transfer-invalid.json').read_text()):
        invalid={**bundle,'data':{'files.asset':''.join(json.dumps(row)+'::JS\n' for row in
                 [{**original,'id':'first'},{**original,'id':'bad',**case['patch']}])}}
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'invalid.sqlite'
            try: load_transfer(invalid,path)
            except Exception: pass
            else: raise AssertionError(f'Invalid transfer accepted: {case["name"]}')
            with sqlite3.connect(path) as con:
                assert con.execute('SELECT COUNT(*) FROM files_asset').fetchone()[0]==0, case['name']
    return cases


def verify_returns(returns):
    cases = {c['name']: c for c in oracle()}
    for item in returns:
        actual = evaluate(item['bundle'])
        assert actual == cases[item['name']]['after'], f'Returned snapshot differs: {item["name"]}'
        if 'files.asset' in item['bundle']['data']:
            rows={r['id']:r for r in (from_tytx(line) for line in item['bundle']['data']['files.asset'].splitlines() if line.strip())}
            assert isinstance(rows['rich']['payload'],Bag)
            assert rows['rich']['binary']==bytes(range(256))
            assert rows['rich']['payload']['nested.when']==rich_bag()['nested.when']
            assert rows['rich']['payload']['nested.binary']==bytes(range(256))
            assert isinstance(rows['empty']['payload'],Bag) and len(rows['empty']['payload'])==0
            assert rows['empty']['binary']==b'' and rows['null']['binary'] is None
            assert rows['edited']['payload']['edited']=='Scritto nel browser'
            assert rows['edited']['binary']==bytes([255,0,128,1])
        # Verify TYTX semantic types independently of SQLite storage coercion.
        if 'work.document' in item['bundle']['data']:
            rows = [from_tytx(line) for line in item['bundle']['data']['work.document'].splitlines() if line.strip()]
            row = next(r for r in rows if r['id']=='d1')
            assert isinstance(row['day'], date) and isinstance(row['moment'], datetime)
            assert isinstance(row['time'], time) and isinstance(row['amount'], Decimal)
            assert isinstance(row['active'], bool)
    print(f'{len(returns)} returns accepted by Python: complete model, migrate, actual structure, values and TYTX types')

if __name__ == '__main__':
    if '--verify-return' in sys.argv:
        verify_returns(json.loads(Path(sys.argv[-1]).read_text()))
    else:
        cases=oracle();(ROOT/'test/fixtures/transfers.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2)+'\n')
        print(f'{len(cases)} Python transfer cases generated')
