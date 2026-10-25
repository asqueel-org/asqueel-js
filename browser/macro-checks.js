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
        if (!equal(sourceRows(model.toTytx()), sourceRows(oracle.source)) || !equal(model.toMigration(), oracle.desired)) throw new Error('Macro model differs from Python');
        await migrateSQLite(db, model.toMigration());
        checks.push('Macro model and migration JSON identical to Python');
        const query = model.queries(db);
        for (const c of oracle.cases) {
            if (!equal(query.compile(c.request), c.compiled)) throw new Error(`Macro SQL/parameters differ: ${c.name}`);
            if (!equal(await query.execute(c.request), c.rows)) throw new Error(`Macro results differ: ${c.name}`);
        }
        checks.push(`${oracle.cases.length} #TEMPLATE/#IN_RANGE cases: SQL, parameters and results identical to Python (NULL, quoting, inclusive/open ranges, formulas and macros)`);
        for (const c of oracle.errors) {
            let rejected = false;
            try { query.compile(c.request); } catch { rejected = true; }
            if (!rejected) throw new Error(`Query not rejected as in Python: ${c.name}`);
        }
        checks.push(`${oracle.errors.length} invalid macros rejected as in Python`);
        await db.close();
        db = await openBrowserSQLite(id);
        for (const c of oracle.cases.filter(c => c.request.operation === 'select'))
            if (!equal(await model.queries(db).execute(c.request), c.rows)) throw new Error(`Macro reread differs: ${c.name}`);
        checks.push('IndexedDB reopen: #TEMPLATE and #IN_RANGE still identical to Python');
        return checks;
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Macro database cleanup blocked'));
        });
    }
}
