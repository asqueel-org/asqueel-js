import cases from '../test/fixtures/composition.json' with {type: 'json'};
import {evaluateComposition} from '../test/composition-cases.js';
import {equal, migrateSQLite} from '../src/sqlite.js';
import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {SqlBuilder, defineModel} from '../src/index.js';
import {querySource, modelFromQuerySource} from '../src/queries.js';
import {groupedItems} from '../examples/groups.js';
import {virtualRelations} from '../examples/virtual-relations.js';

async function virtualRelationPersistenceCheck() {
    const model = modelFromQuerySource(querySource(defineModel(virtualRelations)), SqlBuilder);
    const expected = cases.find(c => c.name === 'virtual_relation_conditional').expected;
    if (!equal(model.toSource(), expected.source) || !equal(model.toMigration(), expected.migration)) {
        throw new Error('VirtualRelation: modello o migrate diversi da Python dopo serializzazione');
    }
    const id = `asqueel-virtual-relations-test-${crypto.randomUUID()}`;
    let db = await openBrowserSQLite(id);
    try {
        await migrateSQLite(db, model.toMigration());
        const queries = model.queries(db);
        await queries.execute({operation: 'insert', table: 'app.customer', values: {id: 1, name: 'Ada'}});
        await queries.execute({operation: 'insert', table: 'app.item', values: {id: 2, name: 'Locale', customer_id: 1}});
        const foreignKeys = await db.query('PRAGMA foreign_key_list(app_item)');
        if (foreignKeys.length !== 1 || foreignKeys[0].table !== 'app_customer') throw new Error('VirtualRelation ha alterato le FK fisiche');
        let rejected = false;
        try { await queries.execute({operation: 'insert', table: 'app.item', values: {id: 3, customer_id: 999}}); }
        catch { rejected = true; }
        if (!rejected) throw new Error('La FK fisica non viene applicata');
        await db.close();
        db = await openBrowserSQLite(id);
        const rows = await model.queries(db).execute({operation: 'select', table: 'app.item', columns: '$id,@customer_id.name AS customer'});
        if (!equal(rows, [{id: 2, customer: 'Ada'}])) throw new Error('VirtualRelation: dati o relazione fisica persi');
        if ((await migrateSQLite(db, model.toMigration())).executed.length) throw new Error('VirtualRelation: migrate non idempotente');
        return 'VirtualRelation: modello Python, migrazione reale senza FK virtuali, vincoli fisici e persistenza IndexedDB';
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Pulizia database virtualRelation bloccata'));
        });
    }
}

async function groupedPersistenceCheck() {
    const original = defineModel(groupedItems);
    const model = modelFromQuerySource(querySource(original), SqlBuilder);
    const expected = cases.find(c => c.name === 'colgroup_and_subtable_together').expected;
    if (!equal(model.toSource(), expected.source) || !equal(model.toMigration(), expected.migration)) {
        throw new Error('Colgroups/subtables: serializzazione diversa dal modello Python');
    }
    const id = `asqueel-groups-test-${crypto.randomUUID()}`;
    let db = await openBrowserSQLite(id);
    try {
        await migrateSQLite(db, model.toMigration());
        await model.queries(db).execute({operation: 'insert', table: 'app.item', values: {id: 1, name: 'Locale', city: 'Roma'}});
        await db.close();
        db = await openBrowserSQLite(id);
        const rows = await model.queries(db).execute({operation: 'select', table: 'app.item', columns: '$id,$name,$city'});
        if (!equal(rows, [{id: 1, name: 'Locale', city: 'Roma'}])) throw new Error('Colgroups/subtables: dati non persistiti');
        if ((await migrateSQLite(db, model.toMigration())).executed.length) throw new Error('Colgroups/subtables: migrate non idempotente');
        return 'Colgroups e subtables: modello Python, migrazione reale, INSERT/SELECT e persistenza IndexedDB';
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Pulizia database colgroups bloccata'));
        });
    }
}

export async function compositionChecks() {
    const passed = [];
    for (const entry of cases) {
        if (!equal(evaluateComposition(entry), entry.expected)) throw new Error(`Composizione diversa da Python: ${entry.name}`);
        passed.push(`Sorgente e migrate identici a Python: ${entry.name}`);
    }
    const desired = evaluateComposition(cases.find(c => c.name === 'several_layers_preserve_order')).migration;
    const id = `asqueel-composition-test-${crypto.randomUUID()}`;
    let db = await openBrowserSQLite(id);
    try {
        await migrateSQLite(db, desired);
        await db.execute('INSERT INTO app_item (id, name, second, third) VALUES (?, ?, ?, ?)', [1, 'Composto', 2, 3]);
        await db.close();
        db = await openBrowserSQLite(id);
        if (!equal(await db.query('SELECT id, name, second, third FROM app_item'), [{id: 1, name: 'Composto', second: 2, third: 3}])) {
            throw new Error('Dati del modello composto non persistiti');
        }
        if ((await migrateSQLite(db, desired)).executed.length) throw new Error('Migrazione composta non idempotente');
        passed.push('Modello composto migrato su WASM/IndexedDB: dati persistiti e diff vuoto dopo riapertura');
        passed.push(await groupedPersistenceCheck());
        passed.push(await virtualRelationPersistenceCheck());
        return passed;
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Pulizia database composizione bloccata'));
        });
    }
}
