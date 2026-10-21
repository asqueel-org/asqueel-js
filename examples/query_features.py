"""Python-authored counterpart of query-features.js."""
from asqueel import SqlBuilder


def feature_model():
    builder = SqlBuilder()
    pkg = builder.source.db('features', implementation='sqlite').packages().package('app')
    item = pkg.table('item', pkey='id', order_by='$id', partition_company='company',
                     draftField='draft', logicalDeletionField='deleted')
    item.column('id', dtype='I')
    item.column('company', dtype='T')
    item.column('value', dtype='I', sqlname='stored_value', sql_default='5')
    item.column('stamp', dtype='I', sql_value=':stamp_value')
    item.column('computed', dtype='I', sql_generatedExpression='stored_value * 2')
    item.column('draft', dtype='B')
    item.column('deleted', dtype='T')
    item.formulaColumn('total', dtype='I', sql_formula='$value + $computed', static=True)
    item.aliasColumn('amount', relation_path='value')
    line = pkg.table('line', pkey='doc_pos')
    line.column('doc', dtype='I', sqlname='document_id')
    line.column('pos', dtype='I')
    line.column('body', dtype='T')
    line.compositeColumn('doc_pos', columns='doc,pos')
    note = pkg.table('note', pkey='id')
    note.column('id', dtype='I')
    note.column('doc', dtype='I')
    note.column('pos', dtype='I')
    note.compositeColumn('line_key', columns='doc,pos').relation('line.doc_pos')
    note.aliasColumn('body', relation_path='@line_key.body')
    return builder
