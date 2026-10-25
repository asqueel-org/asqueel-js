import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSameSource} from './source-parity.js';
import oracle from './fixtures/queries.json' with {type: 'json'};
import {defineModel, SqlBuilder} from '../src/index.js';
import {browserQueries} from '../examples/browser-queries.js';
import {nativeSQLite} from './native-sqlite.js';
import {migrateSQLite} from '../src/sqlite.js';
import {querySource, modelFromQuerySource} from '../src/queries.js';
import {queryRuntimeChecks} from './query-runtime-checks.js';

const model = defineModel(browserQueries);
test('query model migration matches Python and source survives worker serialization', () => {
    assertSameSource(model, oracle.source);
    assert.deepEqual(model.toMigration(), oracle.desired);
    assert.deepEqual(modelFromQuerySource(querySource(model), SqlBuilder).toMigration(), oracle.desired);
});
for (const entry of oracle.cases) test(`SQL + params exactly match Python: ${entry.name}`, () => {
    assert.deepEqual(model.queries().compile(entry.request), entry.compiled);
});
test('queries execute on SQLite with exactly the rows returned in Python', async () => {
    const db = nativeSQLite();
    try {
        await migrateSQLite(db, model.toMigration());
        const queries = model.queries(db);
        for (const c of oracle.cases) assert.deepEqual(await queries.execute(c.request), c.rows, c.name);
        assert.deepEqual(await queries.table('notes.person').query({columns: '$id', order_by: '$id'}).fetch(), [{id: 101}, {id: 102}]);
        const inserted = await queries.table('notes.person').insert({id: 104, name: 'API'});
        assert.deepEqual(inserted, {id: 104, name: 'API', active: 1});
        await assert.rejects(queries.table('notes.person').insert({id: 104, name: 'duplicate'}), /UNIQUE/);
        assert.deepEqual(await queries.table('notes.person').query({columns: '$name', where: '$id = :id', sqlparams: {id: 104}}).fetch(), [{name: 'API'}]);
        await assert.rejects(queries.table('notes.memo').insert({id: 500, person_id: -1}), /FOREIGN KEY/);
    } finally { db.close(); }
});
test('unknown model fields and unsupported syntax fail before execution', () => {
    const compiler = model.queries();
    for (const request of [
        {operation: 'select', table: 'missing'},
        {operation: 'select', table: 'notes.person', columns: '$missing'},
        {operation: 'select', table: 'notes.person', where: '$id=1; DELETE FROM query_people'},
        {operation: 'select', table: 'notes.person', limit: -1},
        {operation: 'select', table: 'notes.person', where: '$id IN :ids', sqlparams: {ids: [1], ids0: 2}},
        {operation: 'select', table: 'notes.person', columns: '#UNKNOWN($id)'},
        {operation: 'select', table: 'notes.person', for_update: true},
        {operation: 'insert', table: 'notes.person', values: {id: NaN}},
        {operation: 'insert', table: 'crm.customer', values: {id: 'x', name: 'blocked'}},
    ]) assert.throws(() => compiler.compile(request), undefined, JSON.stringify(request));
});
test('compile is repeatable and does not mutate the builder, request or parameters', () => {
    const source = querySource(model), compiler = model.queries();
    const request = structuredClone(oracle.cases.find(c => c.name === 'binding_collision').request);
    const before = structuredClone(request);
    const first = compiler.compile(request);
    first.params.ids_1 = 999;
    assert.deepEqual(compiler.compile(request), oracle.cases.find(c => c.name === 'binding_collision').compiled);
    assert.deepEqual(request, before);
    assert.deepEqual(querySource(model), source);
});
test('record helpers and atomic multi-statement transactions on the public adapter', async () => {
    const db = nativeSQLite();
    try {
        await migrateSQLite(db, model.toMigration());
        await queryRuntimeChecks(model.queries(db));
    } finally { await db.close(); }
});
