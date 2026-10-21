import test from 'node:test';
import assert from 'node:assert/strict';
import {SqlBuilder,defineModel} from '../src/index.js';
import {querySource,modelFromQuerySource} from '../src/queries.js';
import {virtualRelations} from '../examples/virtual-relations.js';
import examples from './fixtures/model-examples.json' with {type:'json'};
test('virtualRelation declaration and complete model match Python across serialization',()=>{
    const b=defineModel(virtualRelations),restored=modelFromQuerySource(querySource(b),SqlBuilder);
    assert.deepEqual(restored.toSource(),b.toSource());assert.deepEqual(restored.toJSON(),examples['virtual-relations'].model);
    assert.deepEqual(restored.toMigration(),examples['virtual-relations'].migration);
    const m=restored.resolve();assert.equal(m.relations.get('app.customer.@items').mode,'M');
    assert.equal(m.relations.has('app.item.@selected'),false); // 0.6.1 preserves this as declaration data.
    assert.equal(m.table('app.item').get('virtualRelation_selected').attributes.table,'app.customer');
});
test('virtual relation identity and nested ask ownership survive composition and resolution',()=>{
    const b=defineModel(virtualRelations),t=b.node('db.packages.app.tables.item'),r=t.virtualRelation('selected');
    assert.equal(t.virtualRelation('selected'),r);const ask={fields:[{name:'amount',choices:[1,2]}]};
    b.contribution('custom',()=>t.virtualRelation({name:'selected',ask}));ask.fields[0].choices.push(3);
    const before=b.toSource(),m=b.resolve();m.table('app.item').get('virtualRelation_selected').attributes.ask.fields[0].choices.push(4);
    assert.deepEqual(b.toSource(),before);
});
test('unsupported imported virtual relation attributes fail validation',()=>{
    for(const attribute of ['order_by','limit','inverse','var_','var_bad-name','x_ui_color']){
        const b=defineModel(virtualRelations);b.node('db.packages.app.tables.item.virtualRelation_selected').setAttr({[attribute]:null},false,true,false);
        assert.throws(()=>b.validateSource(),/virtualRelation: unsupported/);assert.throws(()=>b.toMigration(),/virtualRelation: unsupported/);
    }
});
test('virtual navigation cannot execute an ordinary join with the same column name',()=>{
    const b=defineModel(virtualRelations),t=b.node('db.packages.app.tables.item');
    b.node('db.packages.app.tables.item.columns.customer_id.relation_0').setAttr({name:'owner'});
    t.virtualRelation({name:'customer_id',table:'app.customer',condition:'$id=:var_id',var_id:'$id'});
    const queries=b.queries();for(const p of ['@customer_id.name','@selected.name'])assert.throws(()=>queries.compile({operation:'select',table:'app.item',columns:p}),/virtualRelation/);
});
