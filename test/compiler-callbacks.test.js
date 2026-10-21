import test from 'node:test';
import assert from 'node:assert/strict';
import {defineModel} from '../src/index.js';
import {compilerCallbacks, compilerMethods, callbackCacheProbe} from '../examples/compiler-callbacks.js';
import {migrateSQLite} from '../src/sqlite.js';
import {nativeSQLite} from './native-sqlite.js';
import oracle from './fixtures/callbacks.json' with {type: 'json'};
const model = defineModel(compilerCallbacks);
test('compiler callback model and migrate JSON match independent Python', () => {
    assert.deepEqual(model.toJSON(), oracle.model);
    assert.deepEqual(model.toMigration(), oracle.desired);
});
for (const c of oracle.cases) test(`Compiler callback SQL/parameters/calls match Python: ${c.name}`, () => {
    const before = structuredClone(c.request), source = model.toJSON(), events = [];
    assert.deepEqual(model.queries(null, {methods: compilerMethods(events)}).compile(c.request), c.compiled);
    assert.deepEqual(events, c.events);
    assert.deepEqual(c.request, before);
    assert.deepEqual(model.toJSON(), source);
});
for (const c of oracle.errors) test(`Compiler callback rejected like Python: ${c.name}`, () => {
    assert.throws(() => model.queries(null, {methods: compilerMethods()}).compile(c.request));
});
test('compiler callbacks execute on SQLite with independent Python results', async () => {
    const db = nativeSQLite();
    try {
        await migrateSQLite(db, model.toMigration());
        const queries = model.queries(db, {methods: compilerMethods()});
        for (const c of oracle.cases) assert.deepEqual(await queries.execute(c.request), c.rows, c.name);
    } finally { await db.close(); }
});
for (const [name, columns] of [['sql_formula_scaled', '$scaled'], ['env_label', '$label'], ['subquery_total', '$total'], ['formulaColumn_a', '$twice']])
    test(`async compiler method is rejected: ${name}`, () => {
        const methods = compilerMethods();
        methods['app.owner'][name] = async () => { throw new Error('async failure'); };
        assert.throws(() => model.queries(null, {methods}).compile({operation: 'select', table: 'app.owner', columns}), /sincrone/);
    });
test('dynamic columns cache belongs to the environment, definitions to the compilation', () => {
    const events = [], environment = {factor: 3}, query = model.queries(null, {environment, methods: compilerMethods(events)});
    const request = {operation: 'select', table: 'app.owner', columns: '$dynamicscale,$scaled,$dynamic_method'};
    const first = query.compile(request);
    assert.deepEqual(events, ['app.owner.dynamic_a', 'app.owner.dynamic_b', 'app.owner.scaled', 'app.owner.dynamic_method']);
    events.length = 0; environment.factor = 5;
    const second = query.compile(request);
    assert.equal(second.sql, first.sql); // dynamic declaration still uses factor 3
    assert.equal(second.params.f1_factor, 5); // formula callback runs on every compile
    assert.deepEqual(events, ['app.owner.scaled', 'app.owner.dynamic_method']);
    const third = query.compile({...request, environment: {factor: 7}});
    assert.match(third.sql, /\* 7/);
    assert.deepEqual(environment, {factor: 5});
});
test('runtime compiler methods validate table and handler registration', () => {
    assert.throws(() => model.queries(null, {methods: {'app.missing': {env_x() {}}}}));
    assert.throws(() => model.queries(null, {methods: {'app.owner': {invalid() {}}}}));
    assert.throws(() => model.queries(null, {methods: {'app.owner': {env_x: 2}}}));
});

test('dynamic cache lifecycle and callbacks match live Python contract', () => assert.deepEqual(callbackCacheProbe(model), oracle.cache));
