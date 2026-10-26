import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSameSource} from './source-parity.js';
import {defineModel} from '../src/index.js';
import {queryFeatures} from '../examples/query-features.js';
import oracle from './fixtures/query-features.json' with {type: 'json'};
import {nativeSQLite} from './native-sqlite.js';

const model = defineModel(queryFeatures);
test('query feature model migration matches independent Python recipe', () => {
    assertSameSource(model, oracle.source);
    assert.deepEqual(model.toMigration(), oracle.desired);
});
for (const entry of oracle.cases) test(`Feature SQL + params exactly match Python: ${entry.name}`, () => {
    assert.deepEqual(model.queries().compile(entry.request), entry.compiled);
});
test('formulas, SQL defaults, generated columns, policies and composite CRUD execute like Python', async () => {
    const db = nativeSQLite();
    try {
        for (const sql of oracle.ddl) await db.execute(sql);
        for (const c of oracle.cases) assert.deepEqual(await model.queries(db).execute(c.request), c.rows, c.name);
    } finally { await db.close(); }
});
test('write partition, generated column and advanced formula guards fail explicitly', () => {
    const compiler = model.queries();
    assert.throws(() => compiler.compile({operation: 'insert', table: 'app.item', values: {id: 1, company: 'B'},
        environment: {current_company: 'A'}}), /partition/);
    assert.throws(() => compiler.compile({operation: 'insert', table: 'app.item', values: {id: 1, computed: 5}}), /Generated column/);
    assert.throws(() => compiler.compile({operation: 'update', table: 'app.line', values: {body: 'x'}, pkey: '[10]'}), /components/);
});
test('a record key named like a key parameter fails on update; delete binds the key columns only', () => {
    const compiler = model.queries();
    assert.throws(() => compiler.compile({operation: 'update', table: 'app.item', values: {id: 1, __pkey__0: 'x'}, pkey: 1}),
        /app\.item: record keys named as key parameters: __pkey__0/);
    assert.deepEqual(compiler.compile({operation: 'delete', table: 'app.item', values: {id: 1, __pkey__0: 'x'}}),
        {sql: 'DELETE FROM "main"."app_item" WHERE "id"=:__pkey__0', params: {__pkey__0: 1}});
});
