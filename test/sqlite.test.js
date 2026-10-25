import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defineModel} from '../src/index.js';
import {browserSqlite, browserSqliteV2} from '../examples/browser-sqlite.js';
import {diffSQLite, readSQLite, migrateSQLite} from '../src/sqlite.js';
import {nativeSQLite as database} from './native-sqlite.js';
import modelInputs from './model-inputs.json' with {type:'json'};
import {evaluateModel} from './model-cases.js';

const oracle = JSON.parse(readFileSync(new URL('./fixtures/sqlite.json', import.meta.url)));
test('0.6.1 linked hierarchy creates both foreign keys and migrates idempotently', async () => {
    const desired = evaluateModel(modelInputs.find(c => c.name === '061/linked_sysfields_master')).migration;
    assert.ok(desired);
    const db = database();
    try {
        await migrateSQLite(db, desired);
        const tree = await db.query('PRAGMA foreign_key_list(app_item)');
        const master = await db.query('PRAGMA foreign_key_list(app_master)');
        assert.ok(tree.some(r => r.from === 'master_id' && r.table === 'app_master'));
        assert.ok(master.some(r => r.from === 'root_item_id' && r.table === 'app_item' && r.on_delete === 'SET NULL'));
        assert.deepEqual((await migrateSQLite(db, desired)).executed, []);
    } finally { db.close(); }
});
test('SQLite models and live catalog equal independent Python migrations', async () => {
    const db = database();
    try {
        for (const [version, recipe] of [['v1', browserSqlite], ['v2', browserSqliteV2]]) {
            const desired = defineModel(recipe).toMigration();
            assert.deepEqual(desired, oracle[version].desired);
            const result = await migrateSQLite(db, desired);
            assert.deepEqual(result.current, oracle[version].actual);
            assert.deepEqual((await migrateSQLite(db, desired)).executed, []);
            if (version === 'v1') {
                await db.execute('INSERT INTO crm_customer (id,name) VALUES (?,?)', ['demo-customer', 'Cliente di prova']);
                await db.execute('INSERT INTO sales_invoice (id,customer_id,amount) VALUES (?,?,?)', ['demo-invoice', 'demo-customer', 42.5]);
            }
        }
        assert.equal((await db.query('SELECT name FROM crm_customer'))[0].name, 'Cliente di prova');
        assert.equal((await db.query('SELECT amount FROM sales_invoice'))[0].amount, 42.5);
        await assert.rejects(db.execute("INSERT INTO sales_invoice (id,customer_id) VALUES ('bad','missing')"), /FOREIGN KEY/);
    } finally { db.close(); }
});
test('unsupported and destructive changes block the entire migration', async () => {
    const db = database();
    try {
        await migrateSQLite(db, oracle.v1.desired);
        const before = await readSQLite(db);
        const invalid = structuredClone(oracle.v2.desired);
        invalid.root.schemas.main.tables.sales_invoice.columns.amount.attributes.dtype = 'T';
        delete invalid.root.schemas.main.tables.sales_invoice.columns.amount.attributes.size;
        await assert.rejects(migrateSQLite(db, invalid), /non supportata/);
        assert.deepEqual(await readSQLite(db), before);
        assert.throws(() => diffSQLite({root: {schemas: {public: {tables: {}}}}}, before), /solo schema main/);
    } finally { db.close(); }
});
test('execution failure rolls back previous DDL in the same migration', async () => {
    const db = database();
    try {
        await migrateSQLite(db, oracle.v1.desired);
        const before = await readSQLite(db);
        const failing = {...db, execute: async sql => {
            if (sql.includes('CREATE INDEX')) throw new Error('simulated index failure');
            await db.execute(sql);
        }};
        await assert.rejects(migrateSQLite(failing, oracle.v2.desired), /simulated/);
        assert.deepEqual(await readSQLite(db), before);
        await migrateSQLite(db, oracle.v2.desired);
    } finally { db.close(); }
});

test('composite keys, deferred FKs and partial descending indexes round-trip', async () => {
    const model = defineModel(root => {
        const tables = root.db({name: 'browser'}).packages().package({name: 'main', sqlschema: 'main', sqlprefix: false}).tables();
        const parent = tables.table({name: 'parent', pkey: 'key'});
        const pc = parent.columns();
        pc.column({name: 'part', dtype: 'I'});
        pc.column({name: 'code', dtype: 'T'});
        parent.composites().compositeColumn({name: 'key', columns: 'part,code'});
        const child = tables.table({name: 'child', pkey: 'id'});
        const cc = child.columns();
        cc.column({name: 'id', dtype: 'I'});
        cc.column({name: 'part', dtype: 'I'});
        cc.column({name: 'code', dtype: 'T'});
        cc.column({name: 'note', dtype: 'T', sql_default: "'NOT DEFERRABLE'"});
        child.composites().compositeColumn({name: 'parent_key', columns: 'part,code'})
            .relation({related_column: 'main.parent', foreign_key: true, deferred: true});
        child.indexes().index({name: 'note_partial', columns: {note: 'DESC'}, where: 'note IS NOT NULL'});
    });
    const db = database();
    try {
        const desired = model.toMigration();
        await migrateSQLite(db, desired);
        const actual = await readSQLite(db);
        const fk = Object.values(actual.root.schemas.main.tables.child.relations)[0].attributes;
        assert.equal(fk.deferrable, true);
        assert.equal(fk.initially_deferred, true);
        assert.deepEqual(fk.related_columns, ['part', 'code']);
        assert.deepEqual((await migrateSQLite(db, desired)).executed, []);
        await db.execute('BEGIN');
        await db.execute("INSERT INTO child(id,part,code) VALUES(1,2,'abc')");
        await db.execute("INSERT INTO parent(part,code) VALUES(2,'abc')");
        await db.execute('COMMIT');
    } finally { db.close(); }
});

test('catalog features not represented by the PoC fail explicitly', async () => {
    const db = database();
    try {
        await db.execute('CREATE TABLE special (id integer, amount numeric CHECK(amount>0))');
        await assert.rejects(readSQLite(db), /fuori perimetro/);
    } finally { db.close(); }
});
