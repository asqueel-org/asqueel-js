import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {behaviorsModel, runBehaviorCase} from '../test/behaviors-runner.js';
import {equal} from '../src/sqlite.js';
import {sourceRows} from '../src/source-bag.js';
import oracle from '../test/fixtures/behaviors.json' with {type: 'json'};

export async function behaviorsChecks() {
    if (!equal(sourceRows(behaviorsModel.toTytx()), sourceRows(oracle.source)) || !equal(behaviorsModel.toMigration(), oracle.desired))
        throw new Error('Hierarchy/counter model differs from Python');
    const checks = [];
    let sample;
    for (const entry of oracle.cases) {
        const id = `asqueel-behaviors-${crypto.randomUUID()}`;
        let db = await openBrowserSQLite(id);
        try {
            const actual = await runBehaviorCase(db, entry.input);
            if (!equal(actual, entry.expected)) throw new Error(`Hierarchies/counters differ from Python: ${entry.name}`);
            if (entry.name === 'move_subtree_last_sibling') sample = actual;
            await db.close();
            db = await openBrowserSQLite(id);
            for (const [table, rows] of Object.entries(entry.expected.rows)) {
                if (!equal(await db.query(`SELECT * FROM "${table}" ORDER BY id`), rows))
                    throw new Error(`Reopen after ${entry.name}: data differs from Python`);
            }
            checks.push(`${entry.name}: records, events, SQL, rollback and reopen identical to Python`);
        } finally {
            await db.close();
            await new Promise((resolve, reject) => {
                const request = indexedDB.deleteDatabase(id);
                request.onsuccess = resolve;
                request.onerror = () => reject(request.error);
                request.onblocked = () => reject(new Error('Hierarchy database cleanup blocked'));
            });
        }
    }
    return {checks, sample};
}
