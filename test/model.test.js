import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defineModel, SqlBuilder} from '../src/index.js';
import {hashName} from '../src/structures.js';
import {shop} from '../examples/shop.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));
function minimal(edit) {
    return defineModel(root => {
        const db = root.db({name: 'test'});
        const tables = db.schemas().schema({name: 'app'}).tables();
        const table = tables.table({name: 'item', pkey: 'id'});
        const columns = table.columns();
        columns.column({name: 'id', dtype: 'L'});
        edit?.({db, tables, table, columns});
    });
}

test('JS-authored shop is exactly equal to Python migration JSON', () => {
    assert.deepEqual(defineModel(shop).toMigration(), fixture('shop'));
});

test('Python structural hashes match, including Unicode and column order', () => {
    for (const item of fixture('hashes')) {
        assert.equal(hashName(item.schema, item.table, item.columns, item.kind), item.expected);
    }
});

test('rendering is repeatable, fresh and does not mutate the authored model', () => {
    const model = defineModel(shop);
    const first = model.toMigration();
    first.root.schemas.crm.tables.customer.columns.id.attributes.dtype = 'T';
    assert.deepEqual(model.toMigration(), fixture('shop'));
    assert.deepEqual(model.toMigration(), fixture('shop'));
});

test('native Builder subclass lifecycle can author a model', () => {
    class Model extends SqlBuilder { main(root) { shop(root); } }
    const model = new Model();
    model.create();
    assert.deepEqual(model.toMigration(), fixture('shop'));
});

test('declarations are validated using exported signatures', () => {
    assert.throws(() => minimal(({columns}) => columns.column({name: 'bad', dtype: 1})), /dtype/);
    assert.throws(() => minimal(({columns}) => columns.column({name: 'bad', notnull: 'yes'})), /notnull/);
    assert.throws(() => minimal(({columns}) => columns.column({name: 'bad', dtype: 'bogus'})).toMigration(), /dtype/);
});

test('unknown attributes and misplaced options fail explicitly', () => {
    assert.throws(() => minimal(({columns}) => columns.column({name: 'bad', typo: 'T'})).toMigration(), /typo/);
    assert.throws(() => minimal(({table}) => table.options().driver()).toMigration(), /not available/);
    assert.throws(() => minimal(({columns}) => columns.column({name: 'bad', sqlname: 'renamed'})).toMigration(), /sqlname/);
});

test('dangling, duplicate and mismatched structural references fail before output', () => {
    assert.throws(() => minimal(({table}) => table.indexes().index({name: 'bad', columns: 'missing'})).toMigration(), /unknown physical column/);
    assert.throws(() => minimal(({columns}) => columns.column({name: 'fk', dtype: 'L'}).relation({
        to: 'app.missing.id', foreign_key: true,
    })).toMigration(), /unknown relation target/);
    assert.throws(() => minimal(({table}) => table.composites().compositeColumn({
        name: 'bad', columns: 'id,id',
    })).toMigration(), /repeated columns/);
    assert.throws(() => minimal(({table}) => {
        const indexes = table.indexes();
        indexes.index({name: 'first', columns: 'id'});
        indexes.index({name: 'second', columns: 'id'});
    }).toMigration(), /duplicate index/);
    assert.throws(() => minimal(({columns, table}) => {
        columns.column({name: 'other', dtype: 'L'});
        table.composites().compositeColumn({name: 'pair', columns: 'id,other'})
            .relation({to: 'app.item.id', foreign_key: true});
    }).toMigration(), /column counts differ/);
});

test('partial indexes cannot silently suppress a required automatic full index', () => {
    assert.throws(() => minimal(({columns, table}) => {
        columns.column({name: 'code', dtype: 'T', indexed: true});
        table.indexes().index({name: 'partial', columns: 'code', where: 'code IS NOT NULL'});
    }).toMigration(), /partial\/non-btree/);
});

test('semantic columns and UI metadata do not become physical DDL', () => {
    const data = defineModel(shop).toMigration();
    assert.equal(Object.hasOwn(data.root.schemas.sales.tables.invoice.columns, 'gross'), false);
    assert.equal(Object.hasOwn(data.root.schemas.crm.tables.customer.columns.name.attributes, 'name_long'), false);
});

test('empty/multiple roots and broken CHECK constraints fail', () => {
    assert.throws(() => defineModel(() => {}).toMigration(), /exactly one db/);
    assert.throws(() => minimal(({table}) => table.constraints().constraint({
        name: 'bad', constraint_type: 'CHECK',
    })).toMigration(), /CHECK requires/);
});

test('names colliding with Object.prototype remain ordinary JSON properties', () => {
    const model = defineModel(root => {
        root.db({name: 'special'}).schemas().schema({name: '__proto__'}).tables()
            .table({name: 'constructor', pkey: 'id'}).columns().column({name: 'id', dtype: 'L'});
    });
    const structure = model.toMigration();
    assert.equal(Object.hasOwn(structure.root.schemas, '__proto__'), true);
    assert.equal(structure.root.schemas.__proto__.tables.constructor.entity_name, 'constructor');
    assert.equal({}.entity, undefined);
});
