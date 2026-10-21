import {defineModel} from '../src/index.js';
import {migrateSQLite} from '../src/sqlite.js';
import {importRecordsModel, importHandlers} from '../examples/import-records.js';
import {sqliteImportRecord} from '../src/import-values.js';
export const importsModel = defineModel(importRecordsModel);
export function importSource(input) {
    if (!input.generate) return structuredClone(input.source);
    const rows = Array.from({length: input.generate}, (_, i) => ({id: i + 1, name: `item ${i + 1}`}));
    if (input.late_error) rows.at(-1).stock = 'bad';
    if (input.format === 'csv') return 'id,name\n' + rows.map(r => `${r.id},${r.name}\n`).join('');
    if (input.format === 'tytx') return rows.map(r => JSON.stringify(r) + '::JS\n').join('');
    return JSON.stringify(rows);
}
export async function runImportCase(adapter, input, fileSource) {
    await migrateSQLite(adapter, importsModel.toMigration());
    const statements = [], events = [];
    const tracing = {execute: (...args) => adapter.execute(...args), query: async (sql, params = {}) => {
        if (sql.startsWith('INSERT')) statements.push({sql, params: Object.fromEntries(Object.entries(params).map(([k,v]) => [k.replace(/^:/, ''),v]))});
        return adapter.query(sql, params);
    }};
    const db = importsModel.queries(tracing, {hooks: importHandlers(events)}), tableName = input.table ?? 'item';
    const table = db.table('app.' + tableName);
    if (input.setup) await table.sql_insert(structuredClone(input.setup));
    statements.length = events.length = 0;
    let source = importSource(input);
    if (input.kind !== 'records') source = fileSource ? fileSource(source, input) : new File([source], input.filename ?? 'input');
    const options = Object.fromEntries(['format','adapt'].filter(k => k in input).map(k => [k,input[k]]));
    let failed = false, result = null;
    try {result = await table.sql_insert(source, options);}
    catch (error) {failed = true; if (!input.fails) throw new Error(`${input.name}: ${error.message}`, {cause: error});}
    if (Array.isArray(result)) result = result.map(sqliteImportRecord);
    else if (result && typeof result === 'object') result = sqliteImportRecord(result);
    return {failed, result, statements, events, rows: await adapter.query(`SELECT * FROM "${tableName}" ORDER BY id`)};
}
