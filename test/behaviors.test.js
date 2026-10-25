import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSameSource} from './source-parity.js';
import oracle from './fixtures/behaviors.json' with {type: 'json'};
import {behaviorsModel, runBehaviorCase} from './behaviors-runner.js';
import {nativeSQLite} from './native-sqlite.js';
import {migrateSQLite} from '../src/sqlite.js';

test('hierarchy/counter full model and migration match independent Python', () => {
    assertSameSource(behaviorsModel, oracle.source);
    assert.deepEqual(behaviorsModel.toMigration(), oracle.desired);
});
for (const entry of oracle.cases) test(`Python hierarchy/counter: ${entry.name}`, async () => {
    const db = nativeSQLite();
    try { assert.deepEqual(await runBehaviorCase(db, entry.input), entry.expected); }
    finally { await db.close(); }
});
test('concurrent automatic counters and failed transaction reuse', async () => {
    const adapter = nativeSQLite();
    try {
        await migrateSQLite(adapter, behaviorsModel.toMigration());
        const db = behaviorsModel.queries(adapter), table = db.table('app.ranked');
        const rows = await Promise.all(Array.from({length: 12}, (_, i) => table.insert({id: String(i).padStart(22, '0'), scope: 'same'})));
        assert.deepEqual(rows.map(r => r._row_count), Array.from({length: 12}, (_, i) => i + 1));
        await assert.rejects(db.transaction(async tx => {
            assert.equal((await tx.table('app.ranked').insert({scope: 'same'}))._row_count, 13);
            throw new Error('rollback allocation');
        }), /rollback allocation/);
        assert.equal((await table.insert({scope: 'same'}))._row_count, 13);
    } finally { await adapter.close(); }
});

test('archiving a hierarchy requires the referenced key in the partial record', async () => {
    const adapter = nativeSQLite();
    try {
        await migrateSQLite(adapter, behaviorsModel.toMigration());
        const db = behaviorsModel.queries(adapter), table = db.table('app.tree');
        const root = await table.insert({code: 'root'});
        await table.insert({code: 'child', parent_id: root.id});
        const before = await adapter.query('SELECT * FROM tree ORDER BY id');
        await assert.rejects(table.update({__del_ts: '2026-01-02T03:04:05+00:00'}, {old_record: root}), /'id'/);
        assert.deepEqual(await adapter.query('SELECT * FROM tree ORDER BY id'), before);
    } finally { await adapter.close(); }
});
