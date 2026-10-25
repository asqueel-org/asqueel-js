import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {cascadesModel, runCascadeCase} from '../test/cascades-runner.js';
import {equal} from '../src/sqlite.js';
import {sourceRows} from '../src/source-bag.js';
import oracle from '../test/fixtures/cascades.json' with {type: 'json'};

export async function cascadesChecks() {
    if (!equal(sourceRows(cascadesModel.toTytx()), sourceRows(oracle.source)) || !equal(cascadesModel.toMigration(), oracle.desired))
        throw new Error('onUpdate cascade model differs from Python');
    const checks = [];
    let sample;
    for (const entry of oracle.cases) {
        const id = `asqueel-cascades-${crypto.randomUUID()}`;
        let db = await openBrowserSQLite(id);
        try {
            const actual = await runCascadeCase(db, entry.input);
            if (!equal(actual, entry.expected)) throw new Error(`onUpdate cascades differ from Python: ${entry.name}`);
            if (entry.name === 'cascade_chain_and_hooks') sample = actual;
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
                request.onblocked = () => reject(new Error('Cascade database cleanup blocked'));
            });
        }
    }
    return {checks, sample};
}
