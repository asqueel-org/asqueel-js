import test from 'node:test';
import assert from 'node:assert/strict';
import {DbModel, resolveModel} from '../src/index.js';
import oracle from './fixtures/queries.json' with {type: 'json'};
import {nativeSQLite} from './native-sqlite.js';
import {migrateSQLite} from '../src/sqlite.js';

test('official Python JSON drives the same model through SELECT, writes and transactions', async () => {
    const model = DbModel.fromJSON(oracle.model);
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
        assert.strictEqual(queries.tables.get('notes.person').columns.get('name').a,
            model.column('notes.person.name').attributes);
        for (const entry of oracle.cases) {
            assert.deepEqual(queries.compile(entry.request), entry.compiled, entry.name);
            assert.deepEqual(await queries.execute(entry.request), entry.rows, entry.name);
        }
        await queries.transaction(async tx => {
            assert.strictEqual(tx.model, model);
            await tx.table('notes.person').insert({id: 999, name: 'Unified'});
        });
        assert.strictEqual(hookModel, model.table('notes.person'));
        assert.deepEqual(model.toJSON(), oracle.model);
    } finally { adapter.close(); }
});

test('model JSON rejects obsolete formats, inconsistent edges and runtime objects', () => {
    assert.throws(() => DbModel.fromJSON({...oracle.model, version: 1}), /Unsupported model JSON/);
    const broken = structuredClone(oracle.model);
    broken.relations[0].path = 'unrelated.edge';
    assert.throws(() => DbModel.fromJSON(broken), /Relation registry/);
    const model = DbModel.fromJSON(oracle.model);
    model.table('notes.person').attributes.callback = () => {};
    assert.throws(() => model.toJSON(), /symbolic JSON data/);
});
