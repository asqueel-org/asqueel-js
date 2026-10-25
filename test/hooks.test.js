import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSameSource} from './source-parity.js';
import oracle from './fixtures/hooks.json' with {type: 'json'};
import {hooksModel, runHookCase} from './hooks-runner.js';
import {nativeSQLite} from './native-sqlite.js';
import {legacy22} from '../src/write-runtime.js';
import {migrateSQLite} from '../src/sqlite.js';
import {TransactionStateError, UnsupportedFeatureError} from '../src/index.js';

test('sys_fields/hook model and migration JSON match independent Python declarations', () => {
    assertSameSource(hooksModel, oracle.source);
    assert.deepEqual(hooksModel.toMigration(), oracle.desired);
});
test('legacy22 ID algorithm matches Python toolbox bytes and timestamp', () => {
    for (const example of oracle.ids) assert.equal(legacy22(example.milliseconds, Uint8Array.from(example.bytes)), example.expected);
    const generated = Array.from({length: 100}, () => legacy22());
    assert.equal(new Set(generated).size, 100);
    for (const value of generated) assert.match(value, /^Z[0-9A-Za-z]{21}$/);
});
for (const entry of oracle.cases) test(`Python application cycle: ${entry.name}`, async () => {
    const db = nativeSQLite();
    try { assert.deepEqual(await runHookCase(db, entry.input), entry.expected); }
    finally { await db.close(); }
});
test('real clock, asynchronous nested hooks and expired hook contexts', async () => {
    const adapter = nativeSQLite();
    try {
        await migrateSQLite(adapter, hooksModel.toMigration());
        let saved;
        const start = Date.now();
        const db = hooksModel.queries(adapter, {environment: {user: 'live'}, hooks: {'app.simple': {
            async trigger_onInserted(values) {
                saved = this.db;
                assert.equal(this.db.currentTrigger.event, 'insert');
                assert.equal(this.db.currentUser, 'live');
                await Promise.resolve();
                await this.db.table('app.audit').insert({event: 'async', note_id: values.id});
                await assert.rejects(db.table('app.audit').query().fetch(), TransactionStateError);
            },
        }}});
        const record = await db.table('app.simple').insert({title: 'real'});
        assert.match(record.id, /^Z[0-9A-Za-z]{21}$/);
        assert.ok(Date.parse(record.__ins_ts) >= start && Date.parse(record.__mod_ts) <= Date.now());
        assert.equal(record.__ins_user, 'live');
        assert.equal(await db.table('app.audit').query().count(), 1);
        await assert.rejects(saved.table('app.audit').insert({event: 'late'}), TransactionStateError);
        await assert.rejects(db.table('app.plain').insert({title: 'unregistered'}), UnsupportedFeatureError);
        assert.equal(await db.table('app.plain').query().count(), 0);
    } finally { await adapter.close(); }
});
test('runtime registration rejects misspelled hooks and unknown tables', () => {
    assert.throws(() => hooksModel.queries(null, {hooks: {'app.simple': {onInserted() {}}}}), /Hook non valido/);
    assert.throws(() => hooksModel.queries(null, {hooks: {'app.missing': {trigger_onInserted() {}}}}), /Tabella degli hook sconosciuta/);
});
