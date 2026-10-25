/** Independent JavaScript recipe for computed reads and composite projections. */
export function readFormulas(root) {
    const pkg = root.db({name: 'reading', implementation: 'sqlite'}).packages().package({name: 'read'});
    const currency = pkg.table({name: 'currency', pkey: 'id'});
    currency.column({name: 'id', dtype: 'T'});
    currency.column({name: 'factor', dtype: 'R', sqlname: 'conversion_factor'});
    currency.formulaColumn({name: 'adjusted', dtype: 'R', sql_formula: '$factor * :rate', var_rate: 2});
    const item = pkg.table({name: 'item', pkey: 'id', order_by: '$id'});
    item.column({name: 'id', dtype: 'L'});
    item.column({name: 'price', dtype: 'R', sqlname: 'unit_price'});
    item.column({name: 'qty', dtype: 'L'});
    item.column({name: 'currency_id', dtype: 'T'}).relation({related_column: 'currency.id'});
    item.column({name: 'other_currency_id', dtype: 'T'}).relation({related_column: 'currency.id'});
    item.formulaColumn({name: 'adjusted', dtype: 'R', sql_formula: '$price * :rate', var_rate: 1.2});
    item.formulaColumn({name: 'discounted', dtype: 'R', sql_formula: '$adjusted - :rate', var_rate: 3});
    item.formulaColumn({name: 'total', dtype: 'R', sql_formula: '#THIS.adjusted * #THIS.qty'});
    item.formulaColumn({name: 'converted', dtype: 'R', sql_formula: '#THIS.price * #THIS.@currency_id.adjusted'});
    item.aliasColumn({name: 'converted_alias', relation_path: 'converted'});
    item.formulaColumn({name: 'selected', dtype: 'L', sql_formula: 'CASE WHEN $id IN :ids THEN 1 ELSE 0 END', var_ids: [1, 3]});
    item.formulaColumn({name: 'empty_selection', dtype: 'L', sql_formula: 'CASE WHEN $id IN :ids THEN 1 ELSE 0 END', var_ids: []});
    item.formulaColumn({name: 'literal', dtype: 'T', sql_formula: ':text', var_text: '$price'});
    item.formulaColumn({name: 'label', dtype: 'T', sql_formula: '#ENV(currency,fallback_currency)'});
    item.formulaColumn({name: 'env_value', dtype: 'T', sql_formula: '#ENV(value)'});
    item.formulaColumn({name: 'kwargs', dtype: 'R', sql_formula: '$price + :offset', var_kwargs: {offset: 4}});
    const composite = pkg.table({name: 'composite', pkey: 'key'});
    composite.column({name: 'code', dtype: 'T', sqlname: 'stored_code'});
    composite.column({name: 'seq', dtype: 'L'});
    composite.column({name: 'flag', dtype: 'B'});
    composite.column({name: 'day', dtype: 'D'});
    composite.column({name: 'legacy_int', dtype: 'I'});
    composite.compositeColumn({name: 'key', columns: 'code,seq'});
    composite.compositeColumn({name: 'typed', columns: 'flag,day,legacy_int'});
    composite.aliasColumn({name: 'key_alias', relation_path: 'key'});
}
