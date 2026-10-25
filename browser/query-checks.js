import {periodChecks} from './period-checks.js';
import {macroChecks} from './macro-checks.js';
import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {defineModel} from '../src/index.js';
import {browserQueries} from '../examples/browser-queries.js';
import {equal, migrateSQLite} from '../src/sqlite.js';
import {sourceRows} from '../src/source-bag.js';
import oracle from '../test/fixtures/queries.json' with {type: 'json'};
import featureOracle from '../test/fixtures/query-features.json' with {type: 'json'};
import {queryFeatures} from '../examples/query-features.js';
import {queryRuntimeChecks} from '../test/query-runtime-checks.js';
import {readChecks} from './read-checks.js';
import {callbackChecks} from './callback-checks.js';
import {subqueryChecks} from './subquery-checks.js';

export async function queryChecks() {
    const id = `asqueel-query-test-${crypto.randomUUID()}`, checks = [];
    let db = await openBrowserSQLite(id);
    const model = defineModel(browserQueries);
    try {
        if (!equal(sourceRows(model.toTytx()), sourceRows(oracle.source)) || !equal(model.toMigration(), oracle.desired)) throw new Error('Query model differs from Python');
        await migrateSQLite(db, model.toMigration());
        checks.push('Query model identical to Python, four tables migrated');
        let compiler = model.queries(db);
        for (const c of oracle.cases) {
            if (!equal(compiler.compile(c.request), c.compiled)) throw new Error(`SQL/parameters differ: ${c.name}`);
            const rows = await compiler.execute(c.request);
            if (!equal(rows, c.rows)) throw new Error(`Results differ: ${c.name}`);
        }
        checks.push(`${oracle.cases.length} queries: SQL and parameters exactly identical to Python`);
        checks.push(`${oracle.cases.length} SQLite executions: results identical to Python`);
        const people = compiler.table('notes.person');
        let duplicate = false;
        try { await people.insert({id: 101, name: 'duplicato'}); } catch { duplicate = true; }
        if (!duplicate) throw new Error('Duplicate INSERT not rejected');
        const before = await people.query({columns: '*', order_by: '$id'}).fetch();
        if (!equal(before, oracle.cases.find(c => c.name === 'people').rows)) throw new Error('INSERT rollback failed');
        checks.push('Duplicate INSERT rejected; rollback without changing the records');
        await queryRuntimeChecks(compiler);
        checks.push('CRUD, record/count/exists, atomic transactions and rollback verified on WASM');
        const featureModel = defineModel(queryFeatures);
        if (!equal(sourceRows(featureModel.toTytx()), sourceRows(featureOracle.source)) || !equal(featureModel.toMigration(), featureOracle.desired)) throw new Error('Feature model differs from Python');
        for (const sql of featureOracle.ddl) await db.execute(sql);
        for (const c of featureOracle.cases) {
            if (!equal(featureModel.queries().compile(c.request), c.compiled)) throw new Error(`Feature SQL/parameters differ: ${c.name}`);
            if (!equal(await featureModel.queries(db).execute(c.request), c.rows)) throw new Error(`Feature results differ: ${c.name}`);
        }
        checks.push(`${featureOracle.cases.length} additional Python cases: formulas, defaults, generated columns, partitions and composite keys`);
        await db.close();
        db = await openBrowserSQLite(id);
        compiler = model.queries(db);
        const related = oracle.cases.find(c => c.name === 'related_notes');
        if (!equal(await compiler.execute(related.request), related.rows)) throw new Error('Reread after reopen failed');
        checks.push('IndexedDB reopen: SELECT with a relation returns the same data');
        checks.push(...await readChecks());
        checks.push(...await subqueryChecks());
        checks.push(...await callbackChecks());
        checks.push(...await macroChecks());
        checks.push(...await periodChecks());
        return checks;
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Query database cleanup blocked'));
        });
    }
}
