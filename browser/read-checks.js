import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {defineModel} from '../src/index.js';
import {equal, migrateSQLite} from '../src/sqlite.js';
import {sourceRows} from '../src/source-bag.js';
import {readFormulas} from '../examples/read-formulas.js';
import oracle from '../test/fixtures/reads.json' with {type: 'json'};

export async function readChecks() {
    const id = `asqueel-read-test-${crypto.randomUUID()}`, checks = [];
    const model = defineModel(readFormulas);
    let db = await openBrowserSQLite(id);
    try {
        if (!equal(sourceRows(model.toTytx()), sourceRows(oracle.source)) || !equal(model.toMigration(), oracle.desired)) throw new Error('Modello letture diverso da Python');
        await migrateSQLite(db, model.toMigration());
        checks.push('Modello letture e JSON migrate identici alla ricetta Python indipendente');
        const query = model.queries(db);
        for (const c of oracle.cases) {
            if (!equal(query.compile(c.request), c.compiled)) throw new Error(`SQL/parametri letture diversi: ${c.name}`);
            if (!equal(await query.execute(c.request), c.rows)) throw new Error(`Risultati letture diversi: ${c.name}`);
        }
        checks.push(`${oracle.cases.length} casi lettura: SQL, parametri e risultati Python identici su WASM (var_*, #THIS, #ENV, chiavi composte)`);
        await db.close();
        db = await openBrowserSQLite(id);
        for (const c of oracle.cases.filter(c => c.request.operation === 'select'))
            if (!equal(await model.queries(db).execute(c.request), c.rows)) throw new Error(`Rilettura formule diversa: ${c.name}`);
        checks.push('Riapertura IndexedDB: tutte le letture calcolate e le chiavi composte identiche a Python');
        return checks;
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Pulizia database letture bloccata'));
        });
    }
}
