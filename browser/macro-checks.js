import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {defineModel} from '../src/index.js';
import {equal, migrateSQLite} from '../src/sqlite.js';
import {sourceRows} from '../src/source-bag.js';
import {queryMacros} from '../examples/query-macros.js';
import oracle from '../test/fixtures/macros.json' with {type: 'json'};

export async function macroChecks() {
    const id = `asqueel-macro-test-${crypto.randomUUID()}`, checks = [];
    const model = defineModel(queryMacros);
    let db = await openBrowserSQLite(id);
    try {
        if (!equal(sourceRows(model.toTytx()), sourceRows(oracle.source)) || !equal(model.toMigration(), oracle.desired)) throw new Error('Modello macro diverso da Python');
        await migrateSQLite(db, model.toMigration());
        checks.push('Modello macro e JSON migrate identici a Python');
        const query = model.queries(db);
        for (const c of oracle.cases) {
            if (!equal(query.compile(c.request), c.compiled)) throw new Error(`SQL/parametri macro diversi: ${c.name}`);
            if (!equal(await query.execute(c.request), c.rows)) throw new Error(`Risultati macro diversi: ${c.name}`);
        }
        checks.push(`${oracle.cases.length} casi #TEMPLATE/#IN_RANGE: SQL, parametri e risultati identici a Python (NULL, quoting, intervalli inclusivi/aperti, formule e macro)`);
        for (const c of oracle.errors) {
            let rejected = false;
            try { query.compile(c.request); } catch { rejected = true; }
            if (!rejected) throw new Error(`Query non rifiutata come Python: ${c.name}`);
        }
        checks.push(`${oracle.errors.length} macro non valide rifiutate come Python`);
        await db.close();
        db = await openBrowserSQLite(id);
        for (const c of oracle.cases.filter(c => c.request.operation === 'select'))
            if (!equal(await model.queries(db).execute(c.request), c.rows)) throw new Error(`Rilettura macro diversa: ${c.name}`);
        checks.push('Riapertura IndexedDB: #TEMPLATE e #IN_RANGE ancora identiche a Python');
        return checks;
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Pulizia database macro bloccata'));
        });
    }
}
