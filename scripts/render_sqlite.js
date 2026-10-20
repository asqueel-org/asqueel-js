import {nativeSQLite} from '../test/native-sqlite.js';
import {defineModel} from '../src/index.js';
import {browserSqlite, browserSqliteV2} from '../examples/browser-sqlite.js';
import {migrateSQLite} from '../src/sqlite.js';
const db = nativeSQLite(), result = {};
try {
    for (const [version, recipe] of [['v1', browserSqlite], ['v2', browserSqliteV2]]) {
        const desired = defineModel(recipe).toMigration();
        const {current: actual} = await migrateSQLite(db, desired);
        if ((await migrateSQLite(db, desired)).executed.length) throw new Error('Non-idempotent migration');
        result[version] = {desired, actual};
    }
    process.stdout.write(JSON.stringify(result));
} finally { db.close(); }
