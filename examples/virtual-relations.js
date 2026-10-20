/** Independent counterpart of Python's virtual_relation_conditional scenario. */
export function virtualRelations(root) {
    const app = root.db({name: 'composition', implementation: 'sqlite'})
        .packages().package({name: 'app', sqlschema: 'main'});
    const item = app.table({name: 'item', pkey: 'id'});
    item.column({name: 'id', dtype: 'I'});
    item.column({name: 'name', dtype: 'T'});
    item.options();
    const customer = app.table({name: 'customer', pkey: 'id'});
    customer.column({name: 'id', dtype: 'I'});
    customer.column({name: 'name', dtype: 'T', size: ':60', name_long: 'Customer name'});
    item.column({name: 'customer_id', dtype: 'I'}).relation({to: 'app.customer.id', relation_name: 'items'});
    item.virtualRelation({
        name: 'selected', table: 'app.customer', condition: '$id=:var_customer', var_customer: '$customer_id',
        name_long: 'Selected customer', name_short: 'SC', comment: 'Model only',
        ask: {title: 'Filter', fields: [{name: 'year', dtype: 'I'}]},
    });
}
