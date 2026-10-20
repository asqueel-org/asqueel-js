export function browserSqlite(root) {
    const packages = root.db({name: 'browser', implementation: 'sqlite'}).packages();
    const customer = packages.package({name: 'crm'}).tables().table({name: 'customer'});
    customer.options().sys_fields({syscode: true});
    const columns = customer.columns();
    columns.column({name: 'name', dtype: 'T', notnull: true});
    // Versione 2: aggiungi qui email e il suo indice.

    const sales = packages.package({name: 'sales'});
    sales.options().requires({packages: 'crm'});
    const invoice = sales.tables().table({name: 'invoice'});
    const options = invoice.options();
    options.sys_fields({draft: true});
    options.audit({mode: 'lazy'});
    const invoiceColumns = invoice.columns();
    invoiceColumns.column({name: 'customer_id'}).relation({to: 'crm.customer.id', on_delete_sql: 'restrict'});
    invoiceColumns.column({name: 'amount', dtype: 'N', size: '12,2', sqldefault: '0'});
}

// Kept self-contained so the editor can run it without external variables.
export function browserSqliteV2(root) {
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
}
