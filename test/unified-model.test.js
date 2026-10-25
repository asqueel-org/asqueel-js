import test from 'node:test';
import assert from 'node:assert/strict';
import {SqlBuilder, SqlDatabaseConfig, resolveModel} from '../src/index.js';
import oracle from './fixtures/queries.json' with {type: 'json'};
import {nativeSQLite} from './native-sqlite.js';
import {migrateSQLite} from '../src/sqlite.js';
import {assertSameSource} from './source-parity.js';

test('a source saved by Python drives the same model through SELECT, writes and transactions', async () => {
    const recipe = SqlBuilder.fromTytx(oracle.source);
    assert.ok(recipe instanceof SqlDatabaseConfig);
    assertSameSource(recipe, oracle.source);
    assert.deepEqual(recipe.toMigration(), oracle.desired);
    const model = resolveModel(recipe);
    assert.strictEqual(resolveModel(model), model);
    const adapter = nativeSQLite();
    try {
        await migrateSQLite(adapter, model.toMigration());
        let hookModel;
        const queries = model.queries(adapter, {hooks: {'notes.person': {
            trigger_onInserting() { hookModel = this.model; },
        }}});
        assert.strictEqual(queries.model, model);
        assert.strictEqual(queries.tables.get('notes.person').a, model.table('notes.person').attributes);
        for (const entry of oracle.cases) {
            assert.deepEqual(queries.compile(entry.request), entry.compiled, entry.name);
            assert.deepEqual(await queries.execute(entry.request), entry.rows, entry.name);
        }
        await queries.transaction(async tx => {
            assert.strictEqual(tx.model, model);
            await tx.table('notes.person').insert({id: 999, name: 'Unified'});
        });
        assert.strictEqual(hookModel, model.table('notes.person'));
    } finally { adapter.close(); }
});

test('a saved source replays through the grammar and refuses foreign payloads', () => {
    const tytx = SqlBuilder.fromTytx(oracle.source).toTytx();
    assert.throws(() => SqlBuilder.fromTytx(tytx.replace('"name":"browser"', '"name":"browser","x_table_class":"T"')),
        /unknown attribute x_table_class/);
    assert.throws(() => SqlBuilder.fromTytx('{"rows":[]}::X'), /SqlSourceBag|exactly one db/);
    assert.throws(() => SqlBuilder.fromTytx('"text"'), /SqlSourceBag/);
});
