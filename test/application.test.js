import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defineModel} from '../src/index.js';
import {application} from '../examples/application.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));
test('independently authored package/options example equals the Python output', () => {
    const builder = defineModel(application);
    assert.deepEqual(builder.toMigration(), fixture('application'));
});

test('expansion leaves the authored Bag unchanged and repeated renders independent', () => {
    const model = defineModel(application);
    const snapshot = () => {
        const read = bag => bag.getNodes().map(n => ({
            tag: n.nodeTag, attrs: n.getAttr(),
            children: n.value?.getNodes ? read(n.value) : [],
        }));
        return JSON.stringify(read(model.source));
    };
    const before = snapshot();
    const first = model.toMigration();
    first.root.schemas.business.tables.invoices.columns.id.attributes.size = '999';
    assert.deepEqual(model.toMigration(), fixture('application'));
    assert.equal(snapshot(), before);
});

function model(edit) {
    return defineModel(root => {
        const db = root.db({name: 'test'});
        const pkg = db.packages().package({name: 'app'});
        const tables = pkg.tables();
        const table = tables.table({name: 'item'});
        edit({db, pkg, tables, table});
    });
}

test('option-generated fields cannot overwrite incompatible user columns', () => {
    assert.throws(() => model(({table}) => {
        table.columns().column({name: 'id', dtype: 'L'});
        table.options().sys_fields();
    }).toMigration(), /conflicts.*dtype/);
    assert.throws(() => model(({table}) => {
        table.columns().column({name: '__syscode', dtype: 'A', size: ':30'});
        table.options().sys_fields({syscode: true});
    }).toMigration(), /conflicts.*size/);
    assert.throws(() => model(({table}) => {
        table.columns().column({name: '__syscode', dtype: 'A', size: ':20', unique: false});
        table.options().sys_fields({syscode: true});
    }).toMigration(), /conflicts.*unique/);
});

test('missing dependencies and duplicate physical tables fail before returning JSON', () => {
    assert.equal(model(({pkg}) => pkg.options().requires({packages: 'missing'})).resolve().package('app').options.get('requires').attributes.packages,'missing');
    assert.throws(() => defineModel(root => {
        const packages = root.db({name: 'test'}).packages();
        for (const name of ['one', 'two']) {
            packages.package({name, sqlprefix: false}).tables().table({name: 'same'});
        }
    }).toMigration(), /duplicate physical table/);
    assert.throws(() => model(({db}) => db.schemas()).toMigration(), /packages and schemas/);
});

test('enabled options retain Python preconditions and deferred features', () => {
    assert.throws(() => model(({table}) => table.options().audit()).toMigration(), /mode is required/);
    assert.throws(() => model(({table}) => table.options().hierarchical()).toMigration(), /requires id/);
    assert.throws(() => model(({table}) => table.options().attachments({master: 'missing'})).toMigration(), /unknown related table/);
    assert.throws(() => model(({table}) => table.options().system_records({records: {a: {}}})).toMigration(), /deferred in Python/);
    assert.throws(() => model(({table}) => table.options().release({handlers: {'1': 'upgrade'}})).toMigration(), /deferred in Python/);
    assert.throws(() => model(({table}) => table.options().retention({field: 'date', days: -1})).toMigration(), /out of range/);
    assert.throws(() => model(({pkg}) => pkg.options().sys_fields()).toMigration(), /not available/);
});

test('remapped CHECK/partial expressions are not rewritten or silently accepted', () => {
    assert.throws(() => model(({table}) => {
        table.columns().column({name: 'code', dtype: 'T', sqlname: 'other'});
        table.constraints().constraint({name: 'check_code', constraint_type: 'CHECK', check_clause: '(code IS NOT NULL)'});
    }).toMigration(), /CHECK with remapped/);
    assert.throws(() => model(({table}) => {
        table.columns().column({name: 'code', dtype: 'T', sqlname: 'other'});
        table.indexes().index({name: 'idx', columns: 'code', where: 'code IS NOT NULL'});
    }).toMigration(), /partial index with remapped/);
});
