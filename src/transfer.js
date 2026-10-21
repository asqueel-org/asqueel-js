import {Bag, BagResolver} from '@genrojs/bag';
import {fromTytx, toTytx, isDecimal} from '@genrojs/tytx';
// Portable snapshots: declarations travel as a real SourceBag, records as TYTX.
import {sourceBagFromTytx, sourceBagToTytx, SOURCE_ROOT} from '@genrojs/builders';
import {SqlBuilder} from './index.js';
import {migrateSQLite, quote} from './sqlite.js';
import {decodeTytxRow, sqliteImportRecord} from './import-values.js';

const FORMAT = 'asqueel-transfer';
const snapshotTypes = new Set(['A','B','C','D','DH','DHZ','H','I','L','N','R','T','X','O']);
const assert = (ok, message) => { if (!ok) throw new Error(message); };

/** Decode and validate before touching SQLite. Never imports runtime handlers. */
export function readTransfer(bundle) {
    assert(bundle?.format === FORMAT && bundle.version === 1, 'Unsupported transfer format/version');
    assert(bundle.data && typeof bundle.data === 'object' && !Array.isArray(bundle.data), 'Expected table data');
    const builder = new SqlBuilder();
    const source = sourceBagFromTytx(bundle.source, builder);
    const packages = new Set(), required = [];
    const walk = bag => {
        for (const node of bag.getNodes()) {
            if (node.nodeTag === 'package') packages.add(node.attr.name);
            if (node.nodeTag === 'requires') required.push(...(Array.isArray(node.attr.packages) ? node.attr.packages : [node.attr.packages]));
            assert(node.nodeTag !== 'connection' && !Object.hasOwn(node.attr, 'x_table_class'), 'Runtime declarations cannot be transferred');
            if (node.value?.getNodes) walk(node.value);
            else assert(node.value == null, 'Scalar source nodes are unsupported');
        }
    };
    walk(source);
    assert(required.every(name => packages.has(name)), 'Missing required package in source selection');
    builder._sourceroot.setItem(SOURCE_ROOT, source);
    builder.source = source;
    builder.validateSource();
    const model = builder.resolve();
    assert(model.db.attributes.implementation === 'sqlite', 'Expected SQLite source');
    const sqlnames = new Set();
    for (const table of model.tables.values()) {
        assert(table.sqlschema === 'main', 'Expected SQLite main schema');
        assert(!sqlnames.has(table.sqlname.toLowerCase()), 'SQLite table name collision');
        sqlnames.add(table.sqlname.toLowerCase());
    }
    for (const [name, text] of Object.entries(bundle.data)) {
        assert(model.tables.has(name), `Data table absent from source: ${name}`);
        assert(typeof text === 'string', `Expected TYTX text: ${name}`);
        for (const col of model.tables.get(name).columns.values())
            assert(snapshotTypes.has(col.attributes.dtype), `Unsupported snapshot type: ${name}.${col.name}`);
    }
    builder.toMigration();
    return builder;
}

function validateStaticBag(value) {
    if (isDecimal(value)) assert(!/^[+-]?(?:Infinity|s?NaN)$/i.test(value.toString()), 'Non-finite Decimal in Bag');
    if (typeof value === 'number') assert(Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)), 'Unsafe snapshot number in Bag');
    assert(!(value instanceof BagResolver), 'Snapshot Bags cannot contain resolvers');
    if (value instanceof Bag) for (const node of value.getNodes()) {
        assert(node.resolver == null, 'Snapshot Bags cannot contain resolvers');
        validateStaticBag(node.getValue(true));
        validateStaticBag(node.attr);
    }
    else if (Array.isArray(value) || value?.constructor === Object)
        for (const child of Object.values(value)) validateStaticBag(child);
}

function snapshotRow(table, row) {
    const columns = table.columns.values();
    assert(Object.keys(row).length === columns.length && columns.every(c => Object.hasOwn(row, c.name)),
        `${table.fullname}: snapshot requires every physical column exactly once`);
    for (const column of columns) {
        const value = row[column.name], dtype = column.attributes.dtype;
        if (value != null && dtype === 'X') {
            const bag = typeof value === 'string' ? fromTytx(value) : null;
            assert(bag instanceof Bag, 'X snapshot field requires a TYTX Bag or NULL');
            validateStaticBag(bag);
            continue;
        }
        if (value != null && dtype === 'O') {
            assert(value instanceof Uint8Array, 'O snapshot field requires bytes or NULL');
            continue;
        }
        assert(value == null || ['string','number','boolean'].includes(typeof value), 'Unsupported snapshot value');
        if (typeof value === 'number') assert(Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)), 'Unsafe snapshot number');
    }
    return row;
}

/** Migrate, then atomically load all tables (explicit NULL, no hooks/defaults). */
export async function importTransfer(adapter, bundle) {
    const builder = readTransfer(bundle), model = builder.resolve();
    await migrateSQLite(adapter, builder.toMigration());
    const counts = {};
    await builder.queries(adapter).transaction(async () => {
        await adapter.execute('PRAGMA defer_foreign_keys=ON');
        for (const [name, text] of Object.entries(bundle.data)) {
            const table = model.tables.get(name), columns = table.columns.values();
            const sql = `INSERT INTO "main".${quote(table.sqlname)} (${columns.map(c => quote(c.sqlname)).join(', ')}) VALUES (${columns.map((_, i) => ':c' + i).join(', ')})`;
            counts[name] = 0;
            for (const line of text.split(/\r?\n/)) {
                if (!line.trim()) continue;
                const row = sqliteImportRecord(decodeTytxRow(line));
                const raw = JSON.parse(line.endsWith('::JS') ? line.slice(0, -4) : line);
                // Retain the original Bag wire: decoding/re-encoding through JS
                // Date would otherwise lose civil offsets and microseconds.
                for (const c of columns) if (c.attributes.dtype === 'X' && row[c.name] != null) {
                    assert(row[c.name] instanceof Bag, 'X snapshot field requires a Bag or NULL');
                    row[c.name] = raw[c.name];
                }
                snapshotRow(table, row);
                await adapter.execute(sql, Object.fromEntries(columns.map((c, i) => [':c' + i, typeof row[c.name] === 'boolean' ? Number(row[c.name]) : row[c.name]])));
                counts[name]++;
            }
        }
        assert(!(await adapter.query('PRAGMA foreign_key_check')).length, 'Snapshot has missing referenced records');
    });
    return {builder, counts};
}

/** Export all stored records of selected tables. Selection/ownership is application policy. */
export async function exportTransfer(adapter, builder, {tables = [...builder.resolve().tables.keys()]} = {}) {
    const source = sourceBagToTytx(builder.source);
    readTransfer({format: FORMAT, version: 1, source, data: {}});
    const model = builder.resolve(), data = {};
    // One read transaction keeps related tables in the same snapshot.
    await builder.queries(adapter).transaction(async () => {
        for (const name of tables) {
            const table = model.tables.get(name);
            assert(table, `Unknown table: ${name}`);
            const columns = table.columns.values();
            for (const c of columns) assert(snapshotTypes.has(c.attributes.dtype), `Unsupported snapshot type: ${name}.${c.name}`);
            const select = columns.map(c => `${quote(c.sqlname)} AS ${quote(c.name)}`).join(', ');
            const order = columns.filter(c => c.attributes.name === table.attributes.pkey).map(c => quote(c.sqlname));
            const rows = await adapter.query(`SELECT ${select} FROM "main".${quote(table.sqlname)}${order.length ? ' ORDER BY ' + order.join(', ') : ''}`);
            data[name] = rows.map(row => {
                snapshotRow(table, row);
                const wire = Object.fromEntries(columns.map(c => {
                    let value = row[c.name], dtype = c.attributes.dtype;
                    if (value != null) {
                        if (dtype === 'X') { /* Already validated TYTX; keep every nested scalar spelling. */ }
                        else if (dtype === 'O') value = toTytx(value);
                        else if (dtype === 'B') { assert(value === 0 || value === 1 || typeof value === 'boolean', 'Invalid stored boolean'); value = !!value; }
                        else if (['N','D','DH','DHZ','H'].includes(dtype)) value = `${value}::${dtype === 'DH' ? 'DHZ' : dtype}`;
                        else if (typeof value === 'string') value += '::T';
                    }
                    return [c.name, value];
                }));
                return JSON.stringify(wire) + '::JS\n';
            }).join('');
        }
    });
    return {format: FORMAT, version: 1, source, data, omitted: []};
}
