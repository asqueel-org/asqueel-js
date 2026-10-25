import {sqliteBindings} from './sqlite-bindings.js';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import * as SQLite from 'wa-sqlite';
import {IDBBatchAtomicVFS} from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';

/** Instantiate in a Worker. The caller serializes whole operations/transactions. */
export async function openBrowserSQLite(idbName = 'asqueel-js-playground-v1', {wasmBinary} = {}) {
    if (!globalThis.indexedDB || !globalThis.navigator?.locks) {
        throw new Error('Questo browser deve supportare IndexedDB e Web Locks.');
    }
    const module = await SQLiteESMFactory({
        // A single-file export supplies bytes directly and performs no WASM fetch.
        ...(wasmBinary ? {wasmBinary, locateFile:file => file}
            : {locateFile:file => new URL(file, import.meta.url).href}),
    });
    const sqlite = SQLite.Factory(module);
    const bindBlob = module.cwrap('sqlite3_bind_blob', 'number', ['number','number','number','number','number']);
    function bindEmptyBlob(stmt, index) {
        // wa-sqlite 1.0.0 malloc(0) produces a NULL pointer, which SQLite binds
        // as SQL NULL. A non-null pointer + zero length is an actual empty BLOB.
        const ptr = module._sqlite3_malloc(1);
        if (!ptr) throw new Error('SQLite allocation failed');
        try {
            const rc = bindBlob(stmt, index, ptr, 0, -1); // SQLITE_TRANSIENT copies before return.
            if (rc !== SQLite.SQLITE_OK) throw new Error(`SQLite blob binding failed: ${rc}`);
        } finally { module._sqlite3_free(ptr); }
    }
    const vfs = new IDBBatchAtomicVFS(idbName, {durability: 'strict', purge: 'deferred', purgeAtLeast: 16});
    sqlite.vfs_register(vfs, true);
    let db;
    try {
        db = await sqlite.open_v2('browser.db', SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE, vfs.name);
        await sqlite.exec(db, 'PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE;');
    } catch (error) {
        await vfs.close();
        throw error;
    }
    let closed = false;
    const adapter = {
        async query(sql, params = []) {
            if (closed) throw new Error('Database chiuso');
            const rows = [];
            for await (const stmt of sqlite.statements(db, sql)) {
                const bindings = sqliteBindings(params);
                sqlite.bind_collection(stmt, bindings);
                if (Object.values(bindings).some(value => value instanceof Uint8Array && value.byteLength === 0)) {
                    for (let index = 1; index <= sqlite.bind_parameter_count(stmt); index++) {
                        const key = Array.isArray(bindings) ? index - 1 : sqlite.bind_parameter_name(stmt, index);
                        if (bindings[key] instanceof Uint8Array && bindings[key].byteLength === 0) bindEmptyBlob(stmt, index);
                    }
                }
                while (await sqlite.step(stmt) === SQLite.SQLITE_ROW) {
                    rows.push(Object.fromEntries(sqlite.column_names(stmt).map((name, i) => {
                        const value = sqlite.column(stmt, i);
                        // column_blob points into WASM memory, valid only until
                        // the next step/finalize. Give callers owned bytes.
                        return [name, value instanceof Uint8Array ? value.slice() : value];
                    })));
                }
            }
            return rows;
        },
        async execute(sql, params = []) { await adapter.query(sql, params); },
        async close() {
            if (closed) return;
            await sqlite.close(db);
            await vfs.close();
            closed = true;
        },
    };
    return adapter;
}
