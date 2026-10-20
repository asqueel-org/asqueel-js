import test from 'node:test';
import assert from 'node:assert/strict';
import cases from './fixtures/composition.json' with {type: 'json'};
import {evaluateComposition} from './composition-cases.js';
import {SqlBuilder, defineModel, composeModels} from '../src/index.js';
import {querySource, modelFromQuerySource} from '../src/queries.js';

for (const entry of cases) test(`Python source + migration composition: ${entry.name}`, () => {
    assert.deepEqual(evaluateComposition(entry), entry.expected);
});

test('container and declaration identity, input ownership and restored contribution scope', () => {
    const model = new SqlBuilder(), db = model.root.db({name: 'test'}), pkg = db.packages().package({name: 'app'});
    const table = pkg.table({name: 'item'}), options = table.options();
    const payload = {id: {name_long: 'ID'}};
    const fields = options.sys_fields(payload);
    payload.id.name_long = 'external mutation';
    assert.equal(fields.getAttr('id').name_long, 'ID');
    assert.equal(db.packages(), db.packages());
    assert.equal(pkg.table({name: 'item'}), table);
    assert.equal(options.sys_fields(), fields);
    model.contribution('outer', () => {
        table.column({name: 'name', dtype: 'T'});
        assert.throws(() => model.contribution('inner', () => { throw new Error('stop'); }), /stop/);
        assert.throws(() => table.column({name: 'name', dtype: 'I'}), /conflicting/);
    });
    assert.equal(model._contribution, 'main');
    assert.throws(() => model.contribution(' ', () => {}), /nonempty/);
    assert.throws(() => model.contribution('async', async () => {}), /synchronous/);
    const empty = pkg.table({name: 'empty'}), before = model.toSource();
    assert.throws(() => empty.column({name: 'bad.name', dtype: 'T'}), /invalid name/);
    assert.deepEqual(model.toSource(), before);
    model.contribution('copy-scope', () => {
        table.column({name: 'scoped', dtype: 'T'});
        const cloned = model.clone();
        assert.throws(() => cloned.node('db.packages.app.tables.item').column({name: 'scoped', dtype: 'I'}), /conflicting/);
    });
});

test('semantic reset and disabled-field metadata survive worker serialization', () => {
    const model = defineModel(root => {
        const opts = root.db({name: 'test'}).packages().package({name: 'app'}).table({name: 'item'}).options();
        opts.sys_fields({ins: {name_long: 'Created'}});
    });
    const opts = model.node('db.packages.app.tables.item.options');
    model.contribution('disable', () => opts.sys_fields({ins: false}));
    const restored = modelFromQuerySource(querySource(model), SqlBuilder);
    assert.deepEqual(restored.toSource(), model.toSource());
    restored.contribution('enable', () => restored.node('db.packages.app.tables.item.options').sys_fields({ins: true}));
    assert.deepEqual(restored.node('db.packages.app.tables.item.options.sys_fields').getAttr('ins'), {name_long: 'Created'});
    const reset = defineModel(root => root.db({name: 'test'}).packages().package({name: 'app'}).table({name: 'item'}).options().reset({name: 'sys_fields'}));
    const serialized = modelFromQuerySource(querySource(reset), SqlBuilder);
    assert.deepEqual(composeModels(model, serialized).toSource(), composeModels(model, reset).toSource());
});
