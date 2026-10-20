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
            ['demo-customer', 'Cliente di prova']);
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
        check(equal(v1, oracle.v1.desired) && equal(v2, oracle.v2.desired), 'Modelli diversi da Python');
        passed.push('Modelli v1/v2 identici a Python');
        const first = await migrateSQLite(db, v1);
        check(equal(first.current, oracle.v1.actual), 'Catalogo v1 diverso da Python');
        passed.push('Creazione SQLite e catalogo v1 identici a Python');
        await seedDemo(db);
        const failing = {...db, execute: async (sql, params) => {
            if (sql.includes('CREATE INDEX')) throw new Error('errore simulato');
            await db.execute(sql, params);
        }};
        let rolledBack = false;
        try { await migrateSQLite(failing, v2); } catch (e) { rolledBack = e.message === 'errore simulato'; }
        check(rolledBack && equal(await readSQLite(db), oracle.v1.actual), 'Rollback DDL fallito');
        passed.push('Errore durante DDL: rollback completo, nessuna colonna parziale');
        const migrated = await migrateSQLite(db, v2);
        check(equal(migrated.current, oracle.v2.actual), 'Catalogo v2 diverso da Python');
        check((await db.query('SELECT name FROM crm_customer'))[0].name === 'Cliente di prova', 'Dati persi');
        passed.push('Migrazione v2: colonna e indice aggiunti, dati preservati');
        let rejected = false;
        try { await db.execute("INSERT INTO sales_invoice(id,customer_id) VALUES ('bad','missing')"); }
        catch { rejected = true; }
        check(rejected, 'Foreign key non applicata');
        passed.push('Vincoli foreign key applicati dal motore');
        const blocked = structuredClone(v2);
        blocked.root.schemas.main.tables.sales_invoice.columns.amount.attributes.dtype = 'T';
        delete blocked.root.schemas.main.tables.sales_invoice.columns.amount.attributes.size;
        check((await planSQLite(db, blocked)).blocked.length > 0, 'Modifica incompatibile non bloccata');
        passed.push('Modifiche incompatibili rilevate prima dell’esecuzione');
        await db.close();
        db = await openBrowserSQLite(id);
        check(equal(await readSQLite(db), oracle.v2.actual), 'Schema non persistito');
        check((await db.query('SELECT amount FROM sales_invoice'))[0].amount === 42.5, 'Dati non persistiti');
        check((await migrateSQLite(db, v2)).executed.length === 0, 'Migrazione non idempotente');
        passed.push('Nuova connessione WASM: schema e dati persistiti su IndexedDB, diff vuoto');
        return passed;
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Pulizia database di test bloccata'));
        });
    }
}
