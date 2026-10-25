import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSameSource} from './source-parity.js';
import {defineModel} from '../src/index.js';
import {subqueries} from '../examples/subqueries.js';
import {migrateSQLite} from '../src/sqlite.js';
import {nativeSQLite} from './native-sqlite.js';
import oracle from './fixtures/subqueries.json' with {type: 'json'};
const model = defineModel(subqueries);
test('subquery and inverse aggregate model/migrate match independent Python', () => {
    assertSameSource(model, oracle.source);
    assert.deepEqual(model.toMigration(), oracle.desired);
});
for (const c of oracle.cases) test(`Subquery SQL/parameters exactly match Python: ${c.name}`, () => {
    const before = structuredClone(c.request), source = model.toTytx();
    assert.deepEqual(model.queries().compile(c.request), c.compiled);
    assert.deepEqual(model.queries().compile(c.request), c.compiled);
    assert.deepEqual(c.request, before);
    assert.equal(model.toTytx(), source);
});
for (const c of oracle.errors) test(`Subquery rejected like Python: ${c.name}`, () => {
    assert.throws(() => model.queries().compile(c.request));
});
test('subqueries and aggregates execute on real SQLite with Python results', async () => {
    const db = nativeSQLite();
    try {
        await migrateSQLite(db, model.toMigration());
        const queries = model.queries(db);
        for (const c of oracle.cases) assert.deepEqual(await queries.execute(c.request), c.rows, c.name);
    } finally { await db.close(); }
});
