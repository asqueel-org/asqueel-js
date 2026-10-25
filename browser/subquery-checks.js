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
        if (!equal(sourceRows(model.toTytx()), sourceRows(oracle.source)) || !equal(model.toMigration(), oracle.desired)) throw new Error('Subquery model differs from Python');
        await migrateSQLite(db, model.toMigration());
        checks.push('Subquery model, inverse/virtual relations and migration JSON identical to Python');
        const query = model.queries(db);
        for (const c of oracle.cases) {
            if (!equal(query.compile(c.request), c.compiled)) throw new Error(`Subquery SQL/parameters differ: ${c.name}`);
            if (!equal(await query.execute(c.request), c.rows)) throw new Error(`Subquery results differ: ${c.name}`);
        }
        checks.push(`${oracle.cases.length} subqueries/aggregations: SQL, parameters and results identical to Python (EXISTS, scalar, aggr, join, JSON, virtualRelation)`);
        for (const c of oracle.errors) {
            let rejected = false;
            try { query.compile(c.request); } catch { rejected = true; }
            if (!rejected) throw new Error(`Query not rejected as in Python: ${c.name}`);
        }
        checks.push(`${oracle.errors.length} queries rejected before execution, as in Python: cycles, cardinality, options and SQLite capabilities`);
        await db.close();
        db = await openBrowserSQLite(id);
        for (const c of oracle.cases.filter(c => c.request.operation === 'select'))
            if (!equal(await model.queries(db).execute(c.request), c.rows)) throw new Error(`Subquery reread differs: ${c.name}`);
        checks.push('IndexedDB reopen: subqueries and aggregations still identical to Python');
        return checks;
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Subquery database cleanup blocked'));
        });
    }
}
