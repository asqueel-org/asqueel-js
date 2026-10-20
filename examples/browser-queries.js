/** Self-contained editor recipe, extending the existing persistent model. */
export function browserQueries(root) {
    const packages = root.db({name: 'browser', implementation: 'sqlite'}).packages();
    const customer = packages.package({name: 'crm'}).tables().table({name: 'customer'});
    customer.options().sys_fields({syscode: true});
    const columns = customer.columns();
    columns.column({name: 'name', dtype: 'T', notnull: true});
    columns.column({name: 'email', dtype: 'T', indexed: true});
    const sales = packages.package({name: 'sales'});
    sales.options().requires({packages: 'crm'});
    const invoice = sales.tables().table({name: 'invoice'});
    const options = invoice.options();
    options.sys_fields({draft: true});
    options.audit({mode: 'lazy'});
    const invoiceColumns = invoice.columns();
    invoiceColumns.column({name: 'customer_id'}).relation({to: 'crm.customer.id', on_delete_sql: 'restrict'});
    invoiceColumns.column({name: 'amount', dtype: 'N', size: '12,2', sqldefault: '0'});

    // Explicit fields: Python currently rejects writes with active option hooks.
    const tables = packages.package({name: 'notes', sqlprefix: 'q'}).tables();
    const person = tables.table({name: 'person', sqlname: 'query_people', pkey: 'id'});
    const personColumns = person.columns();
    personColumns.column({name: 'id', dtype: 'I'});
    personColumns.column({name: 'name', dtype: 'T', sqlname: 'display_name', notnull: true});
    personColumns.column({name: 'active', dtype: 'B', sqldefault: '1'});
    const memo = tables.table({name: 'memo', pkey: 'id'});
    const memoColumns = memo.columns();
    memoColumns.column({name: 'id', dtype: 'I'});
    memoColumns.column({name: 'person_id'}).relation({to: 'person.id'});
    memoColumns.column({name: 'body', dtype: 'T'});
    memoColumns.column({name: 'amount', dtype: 'N', size: '12,2'});
}
