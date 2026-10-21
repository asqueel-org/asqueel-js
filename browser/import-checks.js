import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {importsModel, runImportCase} from '../test/import-runner.js';
import {equal} from '../src/sqlite.js';
import oracle from '../test/fixtures/imports.json' with {type: 'json'};

export async function importChecks() {
    if (!equal(importsModel.toJSON(), oracle.model) || !equal(importsModel.toMigration(), oracle.desired))
        throw new Error('Modello import diverso da Python');
    const checks = [];
    let sample;
    for (const entry of oracle.cases) {
        const id = `asqueel-import-${crypto.randomUUID()}`;
        let db = await openBrowserSQLite(id);
        try {
            const actual = await runImportCase(db, entry.input);
            if (!equal(actual, entry.expected)) throw new Error(`Ciclo import diverso da Python: ${entry.name}`);
            if (entry.name === 'tytx_typed') sample = actual;
            await db.close();
            db = await openBrowserSQLite(id);
            const table = entry.input.table ?? 'item';
            if (!equal(await db.query(`SELECT * FROM "${table}" ORDER BY id`), entry.expected.rows))
                throw new Error(`Riapertura dopo ${entry.name}: dati diversi da Python`);
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
