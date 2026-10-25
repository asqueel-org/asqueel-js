import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSameSource} from './source-parity.js';
import {nativeSQLite} from './native-sqlite.js';
import {importsModel, runImportCase} from './import-runner.js';
import oracle from './fixtures/imports.json' with {type:'json'};

test('Import model and migrate match independently declared Python', () => {
    assertSameSource(importsModel, oracle.source);
    assert.deepEqual(importsModel.toMigration(), oracle.desired);
});
for (const entry of oracle.cases) test(`Import SQL and results match Python: ${entry.name}`, async () => {
    const db = nativeSQLite();
    try {assert.deepEqual(await runImportCase(db, entry.input), entry.expected);}
    finally {await db.close();}
});

for (const name of ['csv_typed', 'csv_quotes', 'json_typed', 'tytx_typed']) test(`Import survives UTF-8 and record boundaries in tiny stream chunks: ${name}`, async () => {
    const entry = oracle.cases.find(c => c.name === name), db = nativeSQLite();
    try {
        const actual = await runImportCase(db, entry.input, text => {
            const bytes = new TextEncoder().encode(text);
            return {async *[Symbol.asyncIterator]() {for (let i = 0; i < bytes.length; i += 3) yield bytes.slice(i, i + 3);}};
        });
        assert.deepEqual(actual, entry.expected);
    } finally {await db.close();}
});
test('An import failure caught inside a transaction still rolls back the surrounding writes', async () => {
    const db = nativeSQLite();
    const {migrateSQLite} = await import('../src/sqlite.js');
    try {
        await migrateSQLite(db, importsModel.toMigration());
        const queries = importsModel.queries(db);
        await assert.rejects(queries.transaction(async tx => {
            await tx.table('app.item').sql_insert({id: 50, name:'before'});
            try {await tx.table('app.item').sql_insert('[{"id":1},{"id":1}]', {format:'json'});} catch {}
        }));
        assert.deepEqual(await db.query('SELECT * FROM item'), []);
    } finally {await db.close();}
});
test('A failed stream cancels its reader and leaves no imported rows', async () => {
    const db = nativeSQLite();
    const {migrateSQLite} = await import('../src/sqlite.js');
    let cancelled = false;
    const source = new ReadableStream({start(controller) {controller.enqueue(new TextEncoder().encode('[{"unknown":1},'));}, cancel() {cancelled = true;}});
    try {
        await migrateSQLite(db, importsModel.toMigration());
        await assert.rejects(importsModel.queries(db).table('app.item').sql_insert(source, {format:'json'}), /record 1/);
        assert.equal(cancelled,true);
        assert.deepEqual(await db.query('SELECT * FROM item'), []);
    } finally {await db.close();}
});
test('Model adaptation accepts Python floating point spellings and rejects unsafe numbers', async () => {
    const {adaptRecord} = await import('../src/import-values.js');
    const table = {key:'app.numeric', columns:new Map([['value',{a:{dtype:'R'}}]])};
    for (const [text,value] of [['1.',1],['.5',0.5],['+1_000.25e-2',10.0025]])
        assert.deepEqual(adaptRecord(table,{value:text}), {value});
    assert.throws(() => adaptRecord(table, {value:'Infinity'}), /column value/);
    table.columns.get('value').a.dtype = 'L';
    assert.throws(() => adaptRecord(table, {value:'9007199254740993'}), /column value/);
});
