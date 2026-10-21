import {sqliteBindings} from './sqlite-bindings.js';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import * as SQLite from 'wa-sqlite';
import {IDBBatchAtomicVFS} from 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js';

/** Instantiate in a Worker. The caller serializes whole operations/transactions. */
export async function openBrowserSQLite(idbName = 'asqueel-js-playground-v1') {
    if (!globalThis.indexedDB || !globalThis.navigator?.locks) {
        throw new Error('Questo browser deve supportare IndexedDB e Web Locks (HTTPS o localhost).');
    }
    const module = await SQLiteESMFactory({
        locateFile: file => new URL(file, import.meta.url).href,
    });
    const sqlite = SQLite.Factory(module);
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
                sqlite.bind_collection(stmt, sqliteBindings(params));
                while (await sqlite.step(stmt) === SQLite.SQLITE_ROW) {
                    rows.push(Object.fromEntries(sqlite.column_names(stmt).map((name, i) => [name, sqlite.column(stmt, i)])));
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
