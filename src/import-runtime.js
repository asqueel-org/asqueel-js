import {record} from './sql-expressions.js';
import {compileWrite} from './write-compiler.js';
import {assignImportKeys} from './write-runtime.js';
import {readRecords, isFileSource} from './table-io.js';
import {adaptRecord, sqliteImportRecord} from './import-values.js';

export async function adaptImportRecord(db, table, values) {
    const custom = db.runtime.hooks?.[table.key]?.adaptRecord;
    if (!custom) return adaptRecord(table, values);
    return record(await custom.call({db, fullname: table.key, model: db.builder.resolve().table(table.key),
        adaptRecord: data => adaptRecord(table, data)}, values));
}
export async function sqlInsert(db, table, source, options) {
    record(options);
    for (const key of Object.keys(options)) if (!['format', 'adapt', 'ignore_partition'].includes(key)) throw new Error(`Opzione import sconosciuta: ${key}`);
    const file = isFileSource(source), adapt = options.adapt ?? file;
    if (!file && options.format != null) throw new Error('format è ammesso solo per un file');
    const settings = {environment: db.environment(), ignore_partition: options.ignore_partition ?? false, returningRows: false};
    async function adapted(values, index) {
        try {return adapt ? await adaptImportRecord(db, table, values) : record(values);}
        catch (error) {throw new Error(`${table.key} record ${index}: ${error.message}`, {cause: error});}
    }
    async function batch(rows) {
        await assignImportKeys(db, table, rows);
        // Python builds the entire block before executing its consecutive SQL groups.
        const compiled = rows.map(row => compileWrite(table, 'insert', sqliteImportRecord(row), settings));
        for (const query of compiled) await db._executeCompiled(query);
    }
    if (file) {
        let count = 0, block = [];
        for await (const row of readRecords(source, options.format)) {
            block.push(await adapted(row, ++count));
            if (block.length === 1000) {await batch(block); block = [];}
        }
        if (block.length) await batch(block);
        return count;
    }
    if (Array.isArray(source)) {
        const rows = [];
        for (const [index, row] of source.entries()) rows.push(await adapted(row, index + 1));
        await batch(rows);
        return rows;
    }
    const values = await adapted(source, 1);
    await assignImportKeys(db, table, [values]);
    const rows = await db._executeCompiled(compileWrite(table, 'insert', sqliteImportRecord(values), {...settings, returningRows: true}));
    Object.assign(values, rows[0] ?? {});
    return values;
}
