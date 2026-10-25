import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {defineModel} from '../src/index.js';
import {browserSqlite, browserSqliteV2} from '../examples/browser-sqlite.js';
import {equal, migrateSQLite, planSQLite, readSQLite} from '../src/sqlite.js';
import oracle from '../test/fixtures/sqlite.json' with {type: 'json'};

const check = (condition, message) => { if (!condition) throw new Error(message); };
export async function seedDemo(db) {
    await db.execute('BEGIN IMMEDIATE');
    try {
        await db.execute('INSERT INTO crm_customer (id,name) VALUES (?,?) ON CONFLICT(id) DO NOTHING',
            ['demo-customer', 'Sample customer']);
        await db.execute('INSERT INTO sales_invoice (id,customer_id,amount) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING',
            ['demo-invoice', 'demo-customer', 42.5]);
        await db.execute('COMMIT');
    } catch (error) { await db.execute('ROLLBACK'); throw error; }
}

/** Real WASM + real IndexedDB, in an isolated disposable test database. */
export async function browserChecks() {
    const id = `asqueel-test-${crypto.randomUUID()}`, passed = [];
    let db = await openBrowserSQLite(id);
    try {
        const v1 = defineModel(browserSqlite).toMigration(), v2 = defineModel(browserSqliteV2).toMigration();
        check(equal(v1, oracle.v1.desired) && equal(v2, oracle.v2.desired), 'Models differ from Python');
        passed.push('v1/v2 models identical to Python');
        const first = await migrateSQLite(db, v1);
        check(equal(first.current, oracle.v1.actual), 'v1 catalog differs from Python');
        passed.push('SQLite creation and v1 catalog identical to Python');
        await seedDemo(db);
        const failing = {...db, execute: async (sql, params) => {
            if (sql.includes('CREATE INDEX')) throw new Error('simulated error');
            await db.execute(sql, params);
        }};
        let rolledBack = false;
        try { await migrateSQLite(failing, v2); } catch (e) { rolledBack = e.message === 'simulated error'; }
        check(rolledBack && equal(await readSQLite(db), oracle.v1.actual), 'DDL rollback failed');
        passed.push('Error during DDL: complete rollback, no partial column');
        const migrated = await migrateSQLite(db, v2);
        check(equal(migrated.current, oracle.v2.actual), 'v2 catalog differs from Python');
        check((await db.query('SELECT name FROM crm_customer'))[0].name === 'Sample customer', 'Data lost');
        passed.push('v2 migration: column and index added, data kept');
        let rejected = false;
        try { await db.execute("INSERT INTO sales_invoice(id,customer_id) VALUES ('bad','missing')"); }
        catch { rejected = true; }
        check(rejected, 'Foreign key not enforced');
        passed.push('Foreign key constraints enforced by the engine');
        const blocked = structuredClone(v2);
        blocked.root.schemas.main.tables.sales_invoice.columns.amount.attributes.dtype = 'T';
        delete blocked.root.schemas.main.tables.sales_invoice.columns.amount.attributes.size;
        check((await planSQLite(db, blocked)).blocked.length > 0, 'Incompatible change not blocked');
        passed.push('Incompatible changes detected before execution');
        await db.close();
        db = await openBrowserSQLite(id);
        check(equal(await readSQLite(db), oracle.v2.actual), 'Schema not persisted');
        check((await db.query('SELECT amount FROM sales_invoice'))[0].amount === 42.5, 'Data not persisted');
        check((await migrateSQLite(db, v2)).executed.length === 0, 'Migration not idempotent');
        passed.push('New WASM connection: schema and data persisted in IndexedDB, empty diff');
        return passed;
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Test database cleanup blocked'));
        });
    }
}
