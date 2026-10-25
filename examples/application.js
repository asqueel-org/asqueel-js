/** Independently authored counterpart of application.py. */
export function application(root) {
    const db = root.db({name: 'application'});
    const packages = db.packages();
    const crm = packages.package({name: 'crm', sqlschema: 'registry', sqlprefix: false});
    const crmTables = crm.tables();
    const customer = crmTables.table({name: 'customer'});
    customer.options().sysFields({syscode: true, user_upd: false});
    customer.columns().column({name: 'name', dtype: 'T', notnull: true});
    const category = crmTables.table({name: 'category'});
    category.columns().column({name: 'description', dtype: 'T'});
    const categoryOptions = category.options();
    categoryOptions.sysFields();
    categoryOptions.hierarchical({columns: 'description', root_id: true});
    categoryOptions.counter();

    const sales = packages.package({name: 'sales', sqlschema: 'business', sqlprefix: 'ord'});
    const salesOptions = sales.options();
    salesOptions.requires({packages: 'crm'});
    salesOptions.type({name: 'money', dtype: 'N', size: '14,2'});
    const salesTables = sales.tables();
    const invoice = salesTables.table({name: 'invoice', sqlname: 'invoices', partition_customer_id: 'company'});
    let cols = invoice.columns();
    cols.column({name: 'customer_id'}).relation({related_column: 'crm.customer.id', onDelete_sql: 'restrict'});
    cols.column({name: 'amount', dtype: 'money'});
    cols.column({name: 'document', dtype: 'X'});
    const options = invoice.options();
    options.sysFields({draft: true});
    options.fullUpd();
    options.df();
    options.broadcast({columns: 'amount'});

    const row = salesTables.table({name: 'invoice_row'});
    cols = row.columns();
    cols.column({name: 'invoice_id'}).relation({related_column: 'invoice.id', onDelete_sql: 'cascade'});
    cols.column({name: 'amount', dtype: 'money'});
    const rowOptions = row.options();
    rowOptions.sysFields({ins: false, upd: false, user_ins: false, user_upd: false, ldel: false});
    rowOptions.counter({scope: 'invoice_id'});
}
