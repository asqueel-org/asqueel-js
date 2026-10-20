import {defineModel} from '../src/index.js';
import {browserQueries} from '../examples/browser-queries.js';
import {nativeSQLite} from '../test/native-sqlite.js';
import {migrateSQLite} from '../src/sqlite.js';
import fixture from '../test/fixtures/queries.json' with {type: 'json'};
const db = nativeSQLite();
try {
    const model = defineModel(browserQueries), desired = model.toMigration();
    await migrateSQLite(db, desired);
    const queries = model.queries(db), cases = [];
    for (const entry of fixture.cases) cases.push({name: entry.name, request: entry.request,
        compiled: queries.compile(entry.request), rows: await queries.execute(entry.request)});
    process.stdout.write(JSON.stringify({desired, cases}));
} finally { db.close(); }
