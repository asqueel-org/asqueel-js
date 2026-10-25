import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSameSource} from './source-parity.js';
import {defineModel} from '../src/index.js';
import {readFormulas} from '../examples/read-formulas.js';
import {migrateSQLite} from '../src/sqlite.js';
import {nativeSQLite} from './native-sqlite.js';
import oracle from './fixtures/reads.json' with {type: 'json'};

const model = defineModel(readFormulas);
test('computed read model and migrate match the independent Python recipe', () => {
    assertSameSource(model, oracle.source);
    assert.deepEqual(model.toMigration(), oracle.desired);
});
for (const c of oracle.cases) test(`Computed read SQL/parameters match Python: ${c.name}`, () => {
    const original = structuredClone(c.request), source = model.toTytx();
    assert.deepEqual(model.queries().compile(c.request), c.compiled);
    assert.deepEqual(model.queries().compile(c.request), c.compiled);
    assert.deepEqual(c.request, original);
    assert.equal(model.toTytx(), source);
});
test('computed reads execute with exactly the Python SQLite results', async () => {
    const db = nativeSQLite();
    try {
        await migrateSQLite(db, model.toMigration());
        const queries = model.queries(db);
        for (const c of oracle.cases) assert.deepEqual(await queries.execute(c.request), c.rows, c.name);
    } finally { await db.close(); }
});
test('missing environment and non-portable environment values fail explicitly', () => {
    assert.throws(() => model.queries().compile({operation: 'select', table: 'read.item', columns: '$label'}), /#ENV/);
    assert.throws(() => model.queries().compile({operation: 'select', table: 'read.item', columns: '$env_value', environment: {value: {a: 1}}}), /non portabile/);
});
