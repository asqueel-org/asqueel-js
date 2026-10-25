import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSameSource} from './source-parity.js';
import {defineModel} from '../src/index.js';
import {queryPeriods} from '../examples/query-periods.js';
import {migrateSQLite} from '../src/sqlite.js';
import {nativeSQLite} from './native-sqlite.js';
import oracle from './fixtures/periods.json' with {type: 'json'};
const model = defineModel(queryPeriods);
test('PERIOD model/migrate match independent Python', () => {
    assertSameSource(model, oracle.source);
    assert.deepEqual(model.toMigration(), oracle.desired);
});
for (const c of oracle.cases) test(`Period SQL/parameters exactly match Python: ${c.name}`, () => {
    const before = structuredClone(c.request), source = model.toTytx();
    assert.deepEqual(model.queries().compile(c.request), c.compiled);
    assert.deepEqual(model.queries().compile(c.request), c.compiled);
    assert.deepEqual(c.request, before);
    assert.equal(model.toTytx(), source);
});
for (const c of oracle.errors) test(`Period rejected like Python: ${c.name}`, () => {
    assert.throws(() => model.queries().compile(c.request));
});
test('PERIOD macros execute on real SQLite with Python results', async () => {
    const db = nativeSQLite();
    try {
        await migrateSQLite(db, model.toMigration());
        const queries = model.queries(db);
        for (const c of oracle.cases) assert.deepEqual(await queries.execute(c.request), c.rows, c.name);
    } finally { await db.close(); }
});

const relative = oracle.cases.find(c => c.request.sqlparams?.period === 'oggi');
test('PERIOD decodes with the toolbox parser and refreshes each compilation', () => {
    const environment = {locale: 'it-IT', workdate: '2026-10-21'};
    const query = model.queries(null, {environment});
    const {environment: ignored, ...request} = relative.request;
    request.where += ' OR #PERIOD($issued,period)';
    assert.equal(query.compile(request).params.period_from, '2026-10-21');
    environment.workdate = '2026-10-22';
    assert.equal(query.compile(request).params.period_from, '2026-10-22');
});
test('PERIOD has no runtime parser option', () => {
    assert.doesNotThrow(() => model.queries().compile({operation: 'select', table: 'period.event', columns: '$id'}));
    assert.throws(() => model.queries(null, {parseDateExpression: () => null}), /parseDateExpression/);
});
test('PERIOD remains available through table queries and transaction scopes', async () => {
    const db = nativeSQLite();
    try {
        await migrateSQLite(db, model.toMigration());
        const query = model.queries(db, {environment: relative.request.environment});
        await query.transaction(async tx => {
            await tx.table('period.event').insert({id: 42, issued: '2026-10-21'});
            const selection = tx.table('period.event').query({columns: '$id', where: '#PERIOD($issued,period)', sqlparams: {period: 'oggi'}});
            assert.deepEqual(await selection.fetch(), [{id: 42}]);
        });
    } finally { await db.close(); }
});
