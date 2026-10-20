/** Independent counterpart of the Python colgroup_and_subtable_together case. */
export function groupedItems(root) {
    const app = root.db({name: 'composition', implementation: 'sqlite'})
        .packages().package({name: 'app', sqlschema: 'main'});
    const item = app.table({name: 'item', pkey: 'id'});
    item.column({name: 'id', dtype: 'I'});
    item.column({name: 'name', dtype: 'T'});
    item.options();
    const details = item.colgroup({name: 'details', name_long: 'Details', col_dtype: 'T', col_size: ':80'});
    details.column({name: 'city'});
    item.subtable({name: 'active', condition: '$id > :minimum', parameters: {minimum: 0}});
}
