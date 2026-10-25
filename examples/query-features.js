/** Independent JS counterpart of query_features.py; deterministic SQLite features. */
export function queryFeatures(root) {
    const pkg = root.db({name: 'features', implementation: 'sqlite'}).packages().package({name: 'app'});
    const item = pkg.table({name: 'item', pkey: 'id', order_by: '$id', partition_company: 'company',
        draftField: 'draft', logicalDeletionField: 'deleted'});
    item.column({name: 'id', dtype: 'I'});
    item.column({name: 'company', dtype: 'T'});
    item.column({name: 'value', dtype: 'I', sqlname: 'stored_value', sql_default: '5'});
    item.column({name: 'stamp', dtype: 'I', sql_value: ':stamp_value'});
    item.column({name: 'computed', dtype: 'I', sql_generatedExpression: 'stored_value * 2'});
    item.column({name: 'draft', dtype: 'B'});
    item.column({name: 'deleted', dtype: 'T'});
    item.formulaColumn({name: 'total', dtype: 'I', sql_formula: '$value + $computed', static: true});
    item.aliasColumn({name: 'amount', relation_path: 'value'});
    const line = pkg.table({name: 'line', pkey: 'doc_pos'});
    line.column({name: 'doc', dtype: 'I', sqlname: 'document_id'});
    line.column({name: 'pos', dtype: 'I'});
    line.column({name: 'body', dtype: 'T'});
    line.compositeColumn({name: 'doc_pos', columns: 'doc,pos'});
    const note = pkg.table({name: 'note', pkey: 'id'});
    note.column({name: 'id', dtype: 'I'});
    note.column({name: 'doc', dtype: 'I'});
    note.column({name: 'pos', dtype: 'I'});
    note.compositeColumn({name: 'line_key', columns: 'doc,pos'}).relation({related_column: 'line.doc_pos'});
    note.aliasColumn({name: 'body', relation_path: '@line_key.body'});
}
