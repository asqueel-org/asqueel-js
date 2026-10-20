/** Independent counterpart of the Python colgroup example on Python 0.6.0 case. */
export function groupedItems(root) {
    const app = root.db({name: 'composition', implementation: 'sqlite'})
        .packages().package({name: 'app', sqlschema: 'main'});
    const item = app.table({name: 'item', pkey: 'id'});
    item.column({name: 'id', dtype: 'I'});
    item.column({name: 'name', dtype: 'T'});
    item.options();
    const details = item.colgroup({name: 'details', name_long: 'Details', col_dtype: 'T', col_size: ':80'});
    details.column({name: 'city'});
    item.formulaColumn({name:'active',sql_formula:'$id > :minimum',dtype:'B',var_minimum:0});
}
