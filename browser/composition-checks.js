import cases from '../test/fixtures/composition.json' with {type: 'json'};
import {evaluateComposition} from '../test/composition-cases.js';
import {equal, migrateSQLite} from '../src/sqlite.js';
import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';

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
