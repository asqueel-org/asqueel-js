import {sqliteBindings} from './sqlite-bindings.js';

/** Shared driver boundary. Runtime-specific constructors stay in their entry points. */
export function nativeAdapter(database) {
    let closed = false;
    const checkOpen = () => { if (closed) throw new Error('Database closed'); };
    try { database.exec('PRAGMA foreign_keys=ON'); }
    catch (error) { database.close(); throw error; }
    return {
        async query(sql, params = []) {
            checkOpen();
            const values = sqliteBindings(params);
            const bindings = Array.isArray(values) ? values : [values];
            return database.prepare(sql).all(...bindings).map(row => ({...row}));
        },
        async execute(sql, params = []) {
            checkOpen();
            if (Object.keys(params).length) {
                const values = sqliteBindings(params);
                const bindings = Array.isArray(values) ? values : [values];
                database.prepare(sql).run(...bindings);
            } else database.exec(sql);
        },
        async close() {
            if (closed) return;
            database.close();
            closed = true;
        },
    };
}
