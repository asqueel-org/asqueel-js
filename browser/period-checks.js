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
        if (!equal(sourceRows(model.toTytx()), sourceRows(oracle.source)) || !equal(model.toMigration(), oracle.desired)) throw new Error('Period model differs from Python');
        await migrateSQLite(db, model.toMigration());
        checks.push('Period model and migration JSON identical to Python');
        const query = model.queries(db);
        for (const c of oracle.cases) {
            if (!equal(query.compile(c.request), c.compiled)) throw new Error(`Period SQL/parameters differ: ${c.name}`);
            if (!equal(await query.execute(c.request), c.rows)) throw new Error(`Period results differ: ${c.name}`);
        }
        checks.push(`${oracle.cases.length} #PERIOD cases: SQL, parameters and results identical to Python (@genrojs/toolbox parser, Italian/English, relative dates, open ranges, formulas and subqueries)`);
        for (const c of oracle.errors) {
            let rejected = false;
            try { query.compile(c.request); } catch { rejected = true; }
            if (!rejected) throw new Error(`Query not rejected as in Python: ${c.name}`);
        }
        checks.push(`${oracle.errors.length} invalid periods rejected as in Python`);
        await db.close();
        db = await openBrowserSQLite(id);
        for (const c of oracle.cases.filter(c => c.request.operation === 'select'))
            if (!equal(await model.queries(db).execute(c.request), c.rows)) throw new Error(`Period reread differs: ${c.name}`);
        checks.push('IndexedDB reopen: #PERIOD still identical to Python');
        return checks;
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Period database cleanup blocked'));
        });
    }
}
