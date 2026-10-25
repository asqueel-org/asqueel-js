import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {defineModel} from '../src/index.js';
import {equal, migrateSQLite} from '../src/sqlite.js';
import {sourceRows} from '../src/source-bag.js';
import {queryPeriods} from '../examples/query-periods.js';
import oracle from '../test/fixtures/periods.json' with {type: 'json'};

export async function periodChecks() {
    const id = `asqueel-period-test-${crypto.randomUUID()}`, checks = [];
    const model = defineModel(queryPeriods);
    let db = await openBrowserSQLite(id);
    try {
        if (!equal(sourceRows(model.toTytx()), sourceRows(oracle.source)) || !equal(model.toMigration(), oracle.desired)) throw new Error('Modello periodi diverso da Python');
        await migrateSQLite(db, model.toMigration());
        checks.push('Modello periodi e JSON migrate identici a Python');
        const query = model.queries(db);
        for (const c of oracle.cases) {
            if (!equal(query.compile(c.request), c.compiled)) throw new Error(`SQL/parametri periodi diversi: ${c.name}`);
            if (!equal(await query.execute(c.request), c.rows)) throw new Error(`Risultati periodi diversi: ${c.name}`);
        }
        checks.push(`${oracle.cases.length} casi #PERIOD: SQL, parametri e risultati identici a Python (parser Gramlot, italiano/inglese, date relative, intervalli aperti, formule e sottoquery)`);
        for (const c of oracle.errors) {
            let rejected = false;
            try { query.compile(c.request); } catch { rejected = true; }
            if (!rejected) throw new Error(`Query non rifiutata come Python: ${c.name}`);
        }
        checks.push(`${oracle.errors.length} periodi non validi rifiutati come Python`);
        await db.close();
        db = await openBrowserSQLite(id);
        for (const c of oracle.cases.filter(c => c.request.operation === 'select'))
            if (!equal(await model.queries(db).execute(c.request), c.rows)) throw new Error(`Rilettura periodi diversa: ${c.name}`);
        checks.push('Riapertura IndexedDB: #PERIOD ancora identico a Python');
        return checks;
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Pulizia database periodi bloccata'));
        });
    }
}
