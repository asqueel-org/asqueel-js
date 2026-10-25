import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {defineModel} from '../src/index.js';
import {equal, migrateSQLite} from '../src/sqlite.js';
import {sourceRows} from '../src/source-bag.js';
import {subqueries} from '../examples/subqueries.js';
import oracle from '../test/fixtures/subqueries.json' with {type: 'json'};

export async function subqueryChecks() {
    const id = `asqueel-subquery-test-${crypto.randomUUID()}`, checks = [];
    const model = defineModel(subqueries);
    let db = await openBrowserSQLite(id);
    try {
        if (!equal(sourceRows(model.toTytx()), sourceRows(oracle.source)) || !equal(model.toMigration(), oracle.desired)) throw new Error('Modello sottoquery diverso da Python');
        await migrateSQLite(db, model.toMigration());
        checks.push('Modello sottoquery, relazioni inverse/virtuali e JSON migrate identici a Python');
        const query = model.queries(db);
        for (const c of oracle.cases) {
            if (!equal(query.compile(c.request), c.compiled)) throw new Error(`SQL/parametri sottoquery diversi: ${c.name}`);
            if (!equal(await query.execute(c.request), c.rows)) throw new Error(`Risultati sottoquery diversi: ${c.name}`);
        }
        checks.push(`${oracle.cases.length} sottoquery/aggregazioni: SQL, parametri e risultati identici a Python (EXISTS, scalari, aggr, join, JSON, virtualRelation)`);
        for (const c of oracle.errors) {
            let rejected = false;
            try { query.compile(c.request); } catch { rejected = true; }
            if (!rejected) throw new Error(`Query non rifiutata come Python: ${c.name}`);
        }
        checks.push(`${oracle.errors.length} query rifiutate prima dell'esecuzione, come Python: cicli, cardinalità, opzioni e capacità SQLite`);
        await db.close();
        db = await openBrowserSQLite(id);
        for (const c of oracle.cases.filter(c => c.request.operation === 'select'))
            if (!equal(await model.queries(db).execute(c.request), c.rows)) throw new Error(`Rilettura sottoquery diversa: ${c.name}`);
        checks.push('Riapertura IndexedDB: sottoquery e aggregazioni ancora identiche a Python');
        return checks;
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Pulizia database sottoquery bloccata'));
        });
    }
}
