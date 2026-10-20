/** Same declaration as shop.py; only JavaScript syntax differs. */
export function shop(root) {
    const db = root.db({name: 'shop'});
    const schemas = db.schemas();
    const crm = schemas.schema({name: 'crm'}).tables();
    const customer = crm.table({name: 'customer', pkey: 'id', comment: 'Clienti'});
    let cols = customer.columns();
    cols.column({name: 'id', dtype: 'serial', indexed: true});
    cols.column({name: 'code', dtype: 'A', size: '0:20', unique: true, indexed: true});
    cols.column({name: 'name', dtype: 'T', notnull: true, name_long: 'Ragione sociale'});

    const region = crm.table({name: 'region', pkey: 'country,code'});
    cols = region.columns();
    cols.column({name: 'country', dtype: 'A', size: '0:2'});
    cols.column({name: 'code', dtype: 'A', size: '0:8'});
    region.composites().compositeColumn({name: 'key', columns: 'country,code'});

    const sales = schemas.schema({name: 'sales'}).tables();
    const invoice = sales.table({name: 'invoice', pkey: 'id'});
    cols = invoice.columns();
    cols.column({name: 'id', dtype: 'serial4'});
    cols.column({name: 'customer_id', dtype: 'L', notnull: true})
        .relation({to: 'crm.customer.id', foreign_key: true, onDelete_sql: 'RESTRICT'});
    cols.column({name: 'country', dtype: 'A', size: '0:2'});
    cols.column({name: 'region_code', dtype: 'A', size: '0:8'});
    cols.column({name: 'year', dtype: 'I'});
    cols.column({name: 'number', dtype: 'I'});
    cols.column({name: 'issued', dtype: 'D'});
    cols.column({name: 'amount', dtype: 'N', size: '12,2', sql_default: '0'});
    const composites = invoice.composites();
    composites.compositeColumn({name: 'region', columns: 'country,region_code'})
        .relation({to: 'crm.region.key', foreign_key: true, deferred: true});
    composites.compositeColumn({name: 'number_key', columns: 'year,number', unique: true});
    invoice.constraints().constraint({
        name: 'ck_amount', constraint_type: 'CHECK', check_clause: '(amount >= 0)',
    });
    const indexes = invoice.indexes();
    indexes.index({name: 'ix_invoice_customer', columns: 'customer_id'});
    indexes.index({name: 'ix_invoice_date', columns: {issued: 'DESC', id: null}});
    invoice.virtual_columns().formulaColumn({
        name: 'gross', dtype: 'N', sql_formula: '$amount * 1.22',
    });

    const row = sales.table({name: 'invoice_row', pkey: 'id'});
    cols = row.columns();
    cols.column({name: 'id', dtype: 'serial'});
    cols.column({name: 'invoice_id', dtype: 'L'})
        .relation({to: 'sales.invoice', foreign_key: true, onDelete_sql: 'CASCADE'});
    cols.column({name: 'description', size: '0:120', comment: 'Descrizione'});
    cols.column({name: 'sku', dtype: 'T', indexed: true});
    cols.column({name: 'quantity', dtype: 'N', size: '10,2'});
    db.extensions().extension({name: 'pg_trgm'});
}
