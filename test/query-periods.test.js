import {parseDateExpression} from '@gramlot/gramlot';
import test from 'node:test';
import assert from 'node:assert/strict';
import {defineModel} from '../src/index.js';
import {queryPeriods} from '../examples/query-periods.js';
import {migrateSQLite} from '../src/sqlite.js';
import {nativeSQLite} from './native-sqlite.js';
import oracle from './fixtures/periods.json' with {type: 'json'};
const model = defineModel(queryPeriods);
test('PERIOD model/migrate match independent Python', () => {
    assert.deepEqual(model.toJSON(), oracle.model);
    assert.deepEqual(model.toMigration(), oracle.desired);
});
for (const c of oracle.cases) test(`Period SQL/parameters exactly match Python: ${c.name}`, () => {
    const before = structuredClone(c.request), source = model.toJSON();
    assert.deepEqual(model.queries(null, {parseDateExpression}).compile(c.request), c.compiled);
    assert.deepEqual(model.queries(null, {parseDateExpression}).compile(c.request), c.compiled);
    assert.deepEqual(c.request, before);
    assert.deepEqual(model.toJSON(), source);
});
for (const c of oracle.errors) test(`Period rejected like Python: ${c.name}`, () => {
    assert.throws(() => model.queries(null, {parseDateExpression}).compile(c.request));
});
test('PERIOD macros execute on real SQLite with Python results', async () => {
    const db = nativeSQLite();
    try {
        await migrateSQLite(db, model.toMigration());
        const queries = model.queries(db, {parseDateExpression});
        for (const c of oracle.cases) assert.deepEqual(await queries.execute(c.request), c.rows, c.name);
    } finally { await db.close(); }
});

const relative = oracle.cases.find(c => c.request.sqlparams?.period === 'oggi');
test('PERIOD uses the supplied Gramlot parser once per parameter and refreshes each compilation', () => {
    const calls = [];
    const environment = {locale: 'it-IT', workdate: '2026-10-21'};
    const query = model.queries(null, {environment, parseDateExpression: (...args) => {
        calls.push(structuredClone(args));
        return parseDateExpression(...args);
    }});
    const {environment: ignored, ...request} = relative.request;
    request.where += ' OR #PERIOD($issued,period)';
    assert.equal(query.compile(request).params.period_from, '2026-10-21');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], ['oggi', environment]);
    environment.workdate = '2026-10-22';
    assert.equal(query.compile(request).params.period_from, '2026-10-22');
    assert.equal(calls.length, 2);
});
test('PERIOD parser is optional for ordinary queries and required for periods', () => {
    assert.doesNotThrow(() => model.queries().compile({operation: 'select', table: 'period.event', columns: '$id'}));
    assert.throws(() => model.queries().compile(relative.request), /parseDateExpression/);
    assert.throws(() => model.queries(null, {parseDateExpression: 'parser'}), /funzione/);
});
test('PERIOD rejects async and invalid parser contracts without using malformed parameters', () => {
    for (const parser of [async () => {throw new Error('asynchronous failure');}, () => null,
        () => ({ok: true, kind: 'unknown'}), () => ({ok: true, kind: 'date', date: new Date()}),
        () => ({ok: true, kind: 'period', start: 'not a date', end: null})])
        assert.throws(() => model.queries(null, {parseDateExpression: parser}).compile(relative.request), /#PERIOD/);
});
test('PERIOD parser remains available through table queries and transaction scopes', async () => {
    const db = nativeSQLite();
    try {
        await migrateSQLite(db, model.toMigration());
        const query = model.queries(db, {parseDateExpression, environment: relative.request.environment});
        await query.transaction(async tx => {
            await tx.table('period.event').insert({id: 42, issued: '2026-10-21'});
            const selection = tx.table('period.event').query({columns: '$id', where: '#PERIOD($issued,period)', sqlparams: {period: 'oggi'}});
            assert.deepEqual(await selection.fetch(), [{id: 42}]);
        });
    } finally { await db.close(); }
});
