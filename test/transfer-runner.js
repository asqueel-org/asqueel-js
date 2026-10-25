import invalidTransfers from './transfer-invalid.json' with {type:'json'};
import {Bag} from '@genrojs/bag';
import {importTransfer, exportTransfer} from '../src/transfer.js';
import {readSQLite, quote, equal} from '../src/sqlite.js';
import {sourceRows} from '../src/source-bag.js';

function firstDifference(a, b, path = '$') {
    if (equal(a,b)) return '';
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        for (const key of new Set([...Object.keys(a),...Object.keys(b)])) {
            const result = firstDifference(a[key], b[key], path + '.' + key);
            if (result) return result;
        }
    }
    return `${path}: ${JSON.stringify(a)?.slice(0,160)} != ${JSON.stringify(b)?.slice(0,160)}`;
}
function canonicalWire(value) {
    if (typeof value === 'string') {
        if (value.endsWith('::T')) return value.slice(0,-3);
        if (value === '::NN') return null;
        if (value.endsWith('::JS')) return canonicalWire(JSON.parse(value.slice(0,-4)));
    }
    if (Array.isArray(value)) return value.map(canonicalWire);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,canonicalWire(v)]));
    return value;
}
export async function transferSnapshot(adapter, builder) {
    const model = builder.resolve(), rows = {};
    for (const [name, table] of model.tables) {
        rows[name] = await adapter.query(`SELECT * FROM ${quote(table.sqlname)} ORDER BY ${quote(table.columns.get(table.attributes.pkey).sqlname)}`);
    }
    for (const [name, table] of model.tables) for (const row of rows[name]) for (const col of table.columns.values()) {
        const value = row[col.sqlname];
        if (value != null && col.attributes.dtype === 'X') row[col.sqlname] = {bag:canonicalWire(JSON.parse(value.slice(0,-3).replace(/::JS$/, '')))};
        if (value != null && col.attributes.dtype === 'O') row[col.sqlname] = {hex:Array.from(value,b=>b.toString(16).padStart(2,'0')).join('')};
    }
    return {source: sourceRows(builder.toTytx()), migration: builder.toMigration(), structure: await readSQLite(adapter, 'offline'), rows};
}
export async function runInvalidTransfers(adapter, entry) {
    const original = JSON.parse(entry.bundle.data['files.asset'].split('\n')[0].slice(0,-4));
    for (const test of invalidTransfers) {
        const bundle=structuredClone(entry.bundle);
        bundle.data['files.asset']=[{...original,id:'first'}, {...original,id:'bad',...test.patch}].map(r=>JSON.stringify(r)+'::JS\n').join('');
        let failed=false;
        try {await importTransfer(adapter,bundle);} catch {failed=true;}
        if (!failed || (await adapter.query('SELECT * FROM files_asset')).length) throw new Error(`Invalid binary snapshot not rolled back: ${test.name}`);
    }
}
export async function runTransfer(adapter, entry) {
    if (entry.name === 'bags_blobs') {
        const bytes = new Uint8Array([99,0,255,128,99]).subarray(1,4);
        const [probe] = await adapter.query('SELECT ? AS empty, ? AS bytes, ? AS missing', [new Uint8Array(), bytes, null]);
        await adapter.query('SELECT randomblob(65536) AS scratch');
        if (!(probe.empty instanceof Uint8Array) || probe.empty.length || probe.missing !== null || !equal([...probe.bytes],[0,255,128]))
            throw new Error('Blob adapter lost empty values, subarray bounds or ownership');
        await runInvalidTransfers(adapter,entry);
    }
    const {builder, counts} = await importTransfer(adapter, entry.bundle);
    const before = await transferSnapshot(adapter, builder);
    if (!equal(before, entry.before)) throw new Error(`${entry.name}: Python input model/structure/values differ: ${firstDifference(before, entry.before)}`);
    if (builder.resolve().tables.has('work.document')) {
        await builder.queries(adapter).table('work.document').update({id:'d1', title:'Changed offline'});
        await builder.queries(adapter).table('work.line').insert({id:'l2', document_id:'d1', description:'Nuova riga offline', quantity:3});
    }
    if (builder.resolve().tables.has('files.asset')) {
        const edited = new Bag();
        edited.setItem('edited','Written in the browser',{active:true},'>',false,false,null,false,false,null,'field');
        // Keep the snapshot work separate from the broader write-compiler port.
        const bytes = new Uint8Array([99,255,0,128,1,99]).subarray(1,5);
        await adapter.execute('UPDATE files_asset SET payload=:bag, binary=:blob WHERE id=:id', {':bag':edited.toTytx(), ':blob':bytes, ':id':'edited'});
    }
    const after = await transferSnapshot(adapter, builder);
    if (!equal(after, entry.after)) throw new Error(`${entry.name}: Python output model/structure/values differ: ${firstDifference(after, entry.after)}`);
    const bundle = await exportTransfer(adapter, builder);
    return {builder, bundle, counts, before, after};
}
