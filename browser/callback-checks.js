import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {defineModel} from '../src/index.js';
import {equal, migrateSQLite} from '../src/sqlite.js';
import {compilerCallbacks, compilerMethods, callbackCacheProbe} from '../examples/compiler-callbacks.js';
import oracle from '../test/fixtures/callbacks.json' with {type: 'json'};

export async function callbackChecks() {
    const id = `asqueel-callback-test-${crypto.randomUUID()}`, checks = [];
    const model = defineModel(compilerCallbacks);
    let db = await openBrowserSQLite(id);
    try {
        if (!equal(model.toJSON(), oracle.model) || !equal(model.toMigration(), oracle.desired)) throw new Error('Modello callback diverso da Python');
        await migrateSQLite(db, model.toMigration());
        checks.push('Modello callback e JSON migrate identici a Python; funzioni registrate nel worker');
        const events = [], query = model.queries(db, {methods: compilerMethods(events)});
        for (const c of oracle.cases) {
            events.length = 0;
            if (!equal(query.compile(c.request), c.compiled)) throw new Error(`SQL/parametri callback diversi: ${c.name}`);
            if (!equal(events, c.events)) throw new Error(`Chiamate callback diverse: ${c.name}`);
            if (!equal(await query.execute(c.request), c.rows)) throw new Error(`Risultati callback diversi: ${c.name}`);
        }
        checks.push(`${oracle.cases.length} casi callback: SQL, parametri, ordine delle chiamate e risultati identici a Python (formule, sottoquery, #ENV, colonne dinamiche)`);
        for (const c of oracle.errors) {
            let rejected = false;
            try { query.compile(c.request); } catch { rejected = true; }
            if (!rejected) throw new Error(`Query non rifiutata come Python: ${c.name}`);
        }
        checks.push(`${oracle.errors.length} callback non valide rifiutate come Python: metodi mancanti, cicli, valori restituiti e collisioni`);
        await db.close();
        db = await openBrowserSQLite(id);
        for (const c of oracle.cases.filter(c => c.request.operation === 'select'))
            if (!equal(await model.queries(db, {methods: compilerMethods()}).execute(c.request), c.rows)) throw new Error(`Rilettura callback diversa: ${c.name}`);
        checks.push('Riapertura IndexedDB: callback dinamiche ancora identiche a Python');
        if (!equal(callbackCacheProbe(model), oracle.cache)) throw new Error('Cache callback diversa da Python');
        checks.push('Cache per ambiente e ricalcolo delle formule identici a Python');
        return checks;
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Pulizia database callback bloccata'));
        });
    }
}
