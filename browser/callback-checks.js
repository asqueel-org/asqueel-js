import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {defineModel} from '../src/index.js';
import {equal, migrateSQLite} from '../src/sqlite.js';
import {sourceRows} from '../src/source-bag.js';
import {compilerCallbacks, compilerMethods, callbackCacheProbe} from '../examples/compiler-callbacks.js';
import oracle from '../test/fixtures/callbacks.json' with {type: 'json'};

export async function callbackChecks() {
    const id = `asqueel-callback-test-${crypto.randomUUID()}`, checks = [];
    const model = defineModel(compilerCallbacks);
    let db = await openBrowserSQLite(id);
    try {
        if (!equal(sourceRows(model.toTytx()), sourceRows(oracle.source)) || !equal(model.toMigration(), oracle.desired)) throw new Error('Callback model differs from Python');
        await migrateSQLite(db, model.toMigration());
        checks.push('Callback model and migration JSON identical to Python; functions registered in the worker');
        const events = [], query = model.queries(db, {methods: compilerMethods(events)});
        for (const c of oracle.cases) {
            events.length = 0;
            if (!equal(query.compile(c.request), c.compiled)) throw new Error(`Callback SQL/parameters differ: ${c.name}`);
            if (!equal(events, c.events)) throw new Error(`Callback calls differ: ${c.name}`);
            if (!equal(await query.execute(c.request), c.rows)) throw new Error(`Callback results differ: ${c.name}`);
        }
        checks.push(`${oracle.cases.length} callback cases: SQL, parameters, call order and results identical to Python (formulas, subqueries, #ENV, dynamic columns)`);
        for (const c of oracle.errors) {
            let rejected = false;
            try { query.compile(c.request); } catch { rejected = true; }
            if (!rejected) throw new Error(`Query not rejected as in Python: ${c.name}`);
        }
        checks.push(`${oracle.errors.length} invalid callbacks rejected as in Python: missing methods, cycles, return values and collisions`);
        await db.close();
        db = await openBrowserSQLite(id);
        for (const c of oracle.cases.filter(c => c.request.operation === 'select'))
            if (!equal(await model.queries(db, {methods: compilerMethods()}).execute(c.request), c.rows)) throw new Error(`Callback reread differs: ${c.name}`);
        checks.push('IndexedDB reopen: dynamic callbacks still identical to Python');
        if (!equal(callbackCacheProbe(model), oracle.cache)) throw new Error('Callback cache differs from Python');
        checks.push('Environment cache and formula recomputation identical to Python');
        return checks;
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Callback database cleanup blocked'));
        });
    }
}
