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
        if (!equal(sourceRows(model.toTytx()), sourceRows(oracle.source)) || !equal(model.toMigration(), oracle.desired)) throw new Error('Read model differs from Python');
        await migrateSQLite(db, model.toMigration());
        checks.push('Read model and migration JSON identical to the independent Python recipe');
        const query = model.queries(db);
        for (const c of oracle.cases) {
            if (!equal(query.compile(c.request), c.compiled)) throw new Error(`Read SQL/parameters differ: ${c.name}`);
            if (!equal(await query.execute(c.request), c.rows)) throw new Error(`Read results differ: ${c.name}`);
        }
        checks.push(`${oracle.cases.length} read cases: SQL, parameters and Python results identical on WASM (var_*, #THIS, #ENV, composite keys)`);
        await db.close();
        db = await openBrowserSQLite(id);
        for (const c of oracle.cases.filter(c => c.request.operation === 'select'))
            if (!equal(await model.queries(db).execute(c.request), c.rows)) throw new Error(`Formula reread differs: ${c.name}`);
        checks.push('IndexedDB reopen: every computed read and composite key identical to Python');
        return checks;
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Read database cleanup blocked'));
        });
    }
}
