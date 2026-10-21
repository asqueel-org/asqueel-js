import {importTransfer, exportTransfer, readTransfer} from '../src/transfer.js';
import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {transferSnapshot} from '../test/transfer-runner.js';

// Keep the source outside SQLite: it is needed to reopen the database, not a model table.
function metadata(name, value) {
    return new Promise((resolve, reject) => {
        const opening = indexedDB.open(name, 1);
        opening.onupgradeneeded = () => opening.result.createObjectStore('workspace');
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
            const db = opening.result;
            const tx = db.transaction('workspace', value ? 'readwrite' : 'readonly');
            const store = tx.objectStore('workspace');
            const request = value ? store.put(value, 'active') : store.get('active');
            tx.oncomplete = () => { db.close(); resolve(request.result); };
            tx.onabort = () => { db.close(); reject(tx.error || new Error('Salvataggio workspace fallito')); };
        };
    });
}

export function workspaceRequest(type, desired, {openSQLite = openBrowserSQLite, workspaceName = 'asqueel-offline-workspace-v1'} = {}) {
    // Reopen per operation under one cross-tab lock; no stale connection/model after replacement.
    return navigator.locks.request(workspaceName, async () => {
        if (type === 'transfer-load') {
            const bundle = JSON.parse(await desired.file.text());
            const databaseName = 'asqueel-transfer-' + crypto.randomUUID();
            const db = await openSQLite(databaseName);
            try {
                const {builder, counts} = await importTransfer(db, bundle);
                const snapshot = await transferSnapshot(db, builder);
                await db.close();
                await metadata(workspaceName, {databaseName, format:bundle.format, version:bundle.version, source:bundle.source});
                return {databaseName, counts, ...snapshot};
            } catch (error) {
                await db.close().catch(() => {});
                indexedDB.deleteDatabase(databaseName);
                throw error;
            }
        }
        const saved = await metadata(workspaceName);
        if (!saved) {
            if (type === 'transfer-resume') return null;
            throw new Error('Carica prima uno snapshot Python');
        }
        const builder = readTransfer({...saved, data:{}});
        const db = await openSQLite(saved.databaseName);
        try {
            if (type === 'transfer-export') return await exportTransfer(db, builder);
            let compiled, records;
            if (type === 'transfer-edit') {
                const request = desired.request;
                if (!['insert', 'update', 'delete', 'select'].includes(request.operation))
                    throw new Error('Operazione ammessa: insert, update, delete, select');
                const compiler = builder.queries(db);
                compiled = compiler.compile(request);
                records = await compiler.execute(request);
            }
            return {databaseName:saved.databaseName, ...await transferSnapshot(db, builder), compiled, records};
        } finally { await db.close(); }
    });
}
