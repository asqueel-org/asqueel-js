import {importTransfer, exportTransfer} from '../src/transfer.js';
import {readSQLite, quote, equal} from '../src/sqlite.js';

export async function transferSnapshot(adapter, builder) {
    const model = builder.resolve(), rows = {};
    for (const [name, table] of model.tables) {
        rows[name] = await adapter.query(`SELECT * FROM ${quote(table.sqlname)} ORDER BY ${quote(table.columns.get(table.attributes.pkey).sqlname)}`);
    }
    return {model: builder.toJSON(), migration: builder.toMigration(), structure: await readSQLite(adapter, 'offline'), rows};
}
export async function runTransfer(adapter, entry) {
    const {builder, counts} = await importTransfer(adapter, entry.bundle);
    const before = await transferSnapshot(adapter, builder);
    if (!equal(before, entry.before)) throw new Error(`${entry.name}: Python input model/structure/values differ`);
    if (builder.resolve().tables.has('work.document')) {
        await builder.queries(adapter).table('work.document').update({id:'d1', title:'Modificato offline'});
        await builder.queries(adapter).table('work.line').insert({id:'l2', document_id:'d1', description:'Nuova riga offline', quantity:3});
    }
    const after = await transferSnapshot(adapter, builder);
    if (!equal(after, entry.after)) throw new Error(`${entry.name}: Python output model/structure/values differ`);
    const bundle = await exportTransfer(adapter, builder);
    return {builder, bundle, counts, before, after};
}
