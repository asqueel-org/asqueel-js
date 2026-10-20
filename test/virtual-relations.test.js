import test from 'node:test';
import assert from 'node:assert/strict';
import {SqlBuilder, defineModel} from '../src/index.js';
import {projectApplication} from '../src/application.js';
import {querySource, modelFromQuerySource} from '../src/queries.js';
import {virtualRelations} from '../examples/virtual-relations.js';
import cases from './fixtures/composition.json' with {type: 'json'};

test('virtual relation example matches Python and preserves declarations across the worker boundary', () => {
    const model = defineModel(virtualRelations);
    const expected = cases.find(c => c.name === 'virtual_relation_conditional').expected;
    assert.deepEqual(model.toSource(), expected.source);
    const restored = modelFromQuerySource(querySource(model), SqlBuilder);
    assert.deepEqual(restored.toSource(), expected.source);
    assert.deepEqual(restored.toMigration(), expected.migration);
    const {tables} = projectApplication(restored, SqlBuilder, {withModel: true});
    for (const [key, table] of tables) assert.deepEqual(Object.fromEntries(table.relations), expected.model[key].relations);
    assert.equal(tables.get('app.customer').relations.get('items').kind, 'inverse');
    assert.equal([...tables.get('app.customer').relations.values()].some(r => r.kind === 'virtual'), false);
});

test('virtual relation identity and nested ask ownership survive composition, copying and resolution', () => {
    const model = defineModel(virtualRelations), table = model.node('db.packages.app.tables.item');
    const relation = table.virtualRelation('selected');
    assert.equal(table.virtualRelation('selected'), relation);
    const ask = {fields: [{name: 'amount', choices: [1, 2]}]};
    model.contribution('custom', () => table.virtualRelation({name: 'selected', ask}));
    ask.fields[0].choices.push(3);
    assert.deepEqual(relation.getAttr('ask').fields[0].choices, [1, 2]);
    const before = model.toSource(), cloned = model.clone();
    cloned.contribution('other', () => cloned.node('db.packages.app.tables.item')
        .virtualRelation({name: 'selected', condition: '1=1', ask: null}));
    const resolved = projectApplication(model, SqlBuilder, {withModel: true}).tables.get('app.item');
    resolved.relations.get('selected').attributes.ask.fields[0].choices.push(4);
    resolved.declarations[0].attributes.ask.fields[0].choices.push(5);
    assert.deepEqual(model.toSource(), before);
});

test('imported unsupported virtual relation attributes are rejected during validation and rendering', () => {
    for (const attribute of ['order_by', 'limit', 'inverse', 'var_', 'var_bad-name']) {
        const model = defineModel(virtualRelations);
        model.node('db.packages.app.tables.item.virtualRelation_selected').setAttr({[attribute]: null}, false, true, false);
        assert.throws(() => model.validateSource(), /virtualRelation: unsupported/);
        assert.throws(() => model.toMigration(), /virtualRelation: unsupported/);
    }
});

test('virtual navigation stays explicit and cannot execute an ordinary join with the same column name', () => {
    const model = defineModel(virtualRelations), table = model.node('db.packages.app.tables.item');
    // Rename the physical relation semantically; the raw FK column still exists.
    model.node('db.packages.app.tables.item.columns.customer_id.relation_0').setAttr({name: 'owner'});
    table.virtualRelation({name: 'customer_id', table: 'app.customer', condition: '$id=:var_id', var_id: '$id'});
    const queries = model.queries();
    assert.throws(() => queries.compile({operation: 'select', table: 'app.item', columns: '@customer_id.name'}), /virtualRelation/);
    assert.throws(() => queries.compile({operation: 'select', table: 'app.item', columns: '@selected.name'}), /virtualRelation/);
});
