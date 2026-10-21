import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {readTransfer} from '../src/transfer.js';
import {equal} from '../src/sqlite.js';
import {runTransfer, transferSnapshot} from '../test/transfer-runner.js';
import oracle from '../test/fixtures/transfers.json' with {type:'json'};

export async function transferChecks() {
    const checks = [], returns = [];
    for (const entry of oracle) {
        const id = `asqueel-transfer-test-${crypto.randomUUID()}`;
        let db = await openBrowserSQLite(id);
        try {
            const result = await runTransfer(db, entry);
            await db.close(); db = await openBrowserSQLite(id);
            if (!equal(await transferSnapshot(db, readTransfer(result.bundle)), entry.after)) throw new Error(`${entry.name}: IndexedDB reopening differs`);
            returns.push({name:entry.name,bundle:result.bundle});
            checks.push(`${entry.name}: Bag sorgente, modello completo, migrate, catalogo SQLite e valori identici a Python; ${result.builder.resolve().tables.has('work.document') ? 'modifiche offline e ' : ''}riapertura IndexedDB verificata`);
        } finally {
            await db.close();
            await new Promise((resolve,reject) => {
                const request=indexedDB.deleteDatabase(id);
                request.onsuccess=resolve; request.onerror=()=>reject(request.error);
                request.onblocked=()=>reject(new Error('Transfer database cleanup blocked'));
            });
        }
    }
    return {checks, returns, sample:oracle.find(e=>e.name==='tables').after};
}
