/** Independently authored counterpart of application.py. */
export function application(root) {
    const db = root.db({name: 'application'});
    const packages = db.packages();
    const crm = packages.package({name: 'crm', sqlschema: 'registry', sqlprefix: false});
    const crmTables = crm.tables();
    const customer = crmTables.table({name: 'customer'});
    customer.options().sys_fields({syscode: true, user_upd: false});
    customer.columns().column({name: 'name', dtype: 'T', notnull: true});
    const category = crmTables.table({name: 'category'});
    category.columns().column({name: 'description', dtype: 'T'});
    const categoryOptions = category.options();
    categoryOptions.sys_fields();
    categoryOptions.hierarchical({columns: 'description', root_id: true});
    categoryOptions.auto_counter();

    const sales = packages.package({name: 'sales', sqlschema: 'business', sqlprefix: 'ord'});
    const salesOptions = sales.options();
    salesOptions.requires({packages: 'crm'});
    salesOptions.type({name: 'money', dtype: 'N', size: '14,2'});
    const salesTables = sales.tables();
    const invoice = salesTables.table({name: 'invoice', sqlname: 'invoices'});
    let cols = invoice.columns();
    cols.column({name: 'customer_id'}).relation({to: 'crm.customer.id', on_delete_sql: 'restrict'});
    cols.column({name: 'amount', dtype: 'money'});
    cols.column({name: 'document', dtype: 'X'});
    const options = invoice.options();
    options.sys_fields({draft: true});
    options.full_update();
    options.record_hash();
    options.audit({mode: 'lazy'});
    options.dynamic_fields();
    options.protection({tag: 'accounting'});
    options.broadcast({columns: 'amount'});
    options.partition({name: 'company', field: 'customer_id'});

    const row = salesTables.table({name: 'invoice_row'});
    cols = row.columns();
    cols.column({name: 'invoice_id'}).relation({to: 'invoice.id', on_delete_sql: 'cascade'});
    cols.column({name: 'amount', dtype: 'money'});
    const rowOptions = row.options();
    rowOptions.sys_fields({ins: false, upd: false, user_ins: false, user_upd: false, ldel: false});
    rowOptions.auto_counter({scope: 'invoice_id'});

    const docs = packages.package({name: 'docs', sqlschema: 'business'});
    docs.options().requires({packages: 'sales'});
    docs.tables().table({name: 'invoice_file'}).options().attachments({master: 'sales.invoice'});
}
