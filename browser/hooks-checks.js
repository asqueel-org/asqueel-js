import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {hooksModel, runHookCase} from '../test/hooks-runner.js';
import {equal} from '../src/sqlite.js';
import {legacy22} from '../src/write-runtime.js';
import oracle from '../test/fixtures/hooks.json' with {type: 'json'};

export async function hooksChecks() {
    if (!equal(hooksModel.toJSON(), oracle.model) || !equal(hooksModel.toMigration(), oracle.desired))
        throw new Error('Modello sys_fields/hook diverso da Python');
    for (const example of oracle.ids) if (legacy22(example.milliseconds, Uint8Array.from(example.bytes)) !== example.expected)
        throw new Error('Algoritmo ID diverso da Python');
    const checks = [];
    let sample;
    for (const entry of oracle.cases) {
        const id = `asqueel-hooks-${crypto.randomUUID()}`;
        let db = await openBrowserSQLite(id);
        try {
            const actual = await runHookCase(db, entry.input);
            if (!equal(actual, entry.expected)) throw new Error(`Ciclo sys_fields/hook diverso da Python: ${entry.name}`);
            if (entry.name === 'insert_order_and_nested_audit') sample = actual;
            await db.close();
            db = await openBrowserSQLite(id);
            for (const [table, rows] of Object.entries(entry.expected.rows)) {
                if (!equal(await db.query(`SELECT * FROM "${table}" ORDER BY id`), rows))
                    throw new Error(`Riapertura dopo ${entry.name}: dati diversi da Python`);
            }
            checks.push(`${entry.name}: record, eventi, SQL, rollback e riapertura identici a Python`);
        } finally {
            await db.close();
            await new Promise((resolve, reject) => {
                const request = indexedDB.deleteDatabase(id);
                request.onsuccess = resolve;
                request.onerror = () => reject(request.error);
                request.onblocked = () => reject(new Error('Pulizia database hook bloccata'));
            });
        }
    }
    return {checks, sample};
}
