"""Python source -> TYTX -> SQLite oracle; also accepts actual browser return bundles."""
import json, sys, tempfile, sqlite3
from pathlib import Path
from datetime import date, datetime, time
from decimal import Decimal
from python_reference import ROOT
sys.path.insert(0, str(ROOT / 'python'))
from asqueel_transfer import export_transfer, load_transfer, read_transfer, quote
from asqueel import SqlDatabaseConfig, SqlMigrationRenderer, resolve_model
from asqueel_migration.readers.sqlite_reader import SqliteReader
from model_oracle import document


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


def snapshot(builder, path):
    model = resolve_model(builder)
    with sqlite3.connect(path) as con:
        con.row_factory = sqlite3.Row
        rows = {name: [dict(r) for r in con.execute(f'SELECT * FROM {quote(t.sqlname)} ORDER BY {quote(t.columns[t.attributes["pkey"]].sqlname)}')]
                for name, t in model.tables.items()}
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
    return cases


def verify_returns(returns):
    cases = {c['name']: c for c in oracle()}
    for item in returns:
        actual = evaluate(item['bundle'])
        assert actual == cases[item['name']]['after'], f'Returned snapshot differs: {item["name"]}'
        # Verify TYTX semantic types independently of SQLite storage coercion.
        from genro_tytx import from_tytx
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
