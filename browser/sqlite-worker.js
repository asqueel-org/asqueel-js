import {transferChecks} from './transfer-checks.js';
import {workspaceRequest} from './offline-workspace.js';
import {importChecks} from './import-checks.js';
import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {readSQLite, planSQLite, migrateSQLite, quote} from '../src/sqlite.js';
import {seedDemo, browserChecks} from './sqlite-checks.js';
import {queryChecks} from './query-checks.js';
import {cascadesChecks} from './cascades-checks.js';
import {behaviorsChecks} from './behaviors-checks.js';
import {hooksChecks} from './hooks-checks.js';
import {compositionChecks} from './composition-checks.js';
import {modelFromQuerySource} from '../src/queries.js';
import {SqlBuilder} from '../src/index.js';

const DATABASE = 'asqueel-js-playground-v1';
let db, queue = Promise.resolve();
async function inspect() {
    const structure = await readSQLite(db);
    const rows = [];
    for (const name of Object.keys(structure.root.schemas.main.tables)) {
        rows.push({table: name, rows: (await db.query(`SELECT COUNT(*) AS n FROM ${quote(name)}`))[0].n});
    }
    return {structure, rows};
}
async function dispatch(type, desired) {
    if (type === 'transfer-checks') return transferChecks();
    if (type.startsWith('transfer-')) return workspaceRequest(type, desired);
    if (type === 'composition-checks') return compositionChecks();
    if (type === 'checks') return browserChecks();
    if (type === 'query-checks') return queryChecks();
    if (type === 'cascades-checks') return cascadesChecks();
    if (type === 'behaviors-checks') return behaviorsChecks();
    if (type === 'import-checks') return importChecks();
    if (type === 'hooks-checks') return hooksChecks();
    return navigator.locks.request(`${DATABASE}:migration`, async () => {
        db ??= await openBrowserSQLite(DATABASE);
        if (type === 'query') {
            const model = modelFromQuerySource(desired.source, SqlBuilder);
            const compiler = model.queries(db);
            const compiled = compiler.compile(desired.request);
            const records = await compiler.execute(desired.request);
            return {compiled, records, ...await inspect()};
        }
        if (type === 'import') {
            const model = modelFromQuerySource(desired.source, SqlBuilder);
            const count = await model.queries(db).table(desired.table).sql_insert(desired.file);
            return {count, ...await inspect()};
        }
        if (type === 'inspect') return inspect();
        if (type === 'plan') return planSQLite(db, desired);
        if (type === 'apply') return {...await migrateSQLite(db, desired), ...await inspect()};
        if (type === 'seed') { await seedDemo(db); return inspect(); }
        if (type === 'reopen') { await db.close(); db = null; db = await openBrowserSQLite(DATABASE); return inspect(); }
        throw new Error(`Unknown operation: ${type}`);
    });
}
self.onmessage = ({data: {id, type, desired}}) => {
    queue = queue.then(async () => {
        try { self.postMessage({id, result: await dispatch(type, desired)}); }
        catch (e) { self.postMessage({id, error: e.message}); }
    });
};
