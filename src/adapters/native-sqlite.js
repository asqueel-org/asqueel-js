/** Shared driver boundary. Runtime-specific constructors stay in their entry points. */
export function nativeAdapter(database) {
    let closed = false;
    const checkOpen = () => { if (closed) throw new Error('Database closed'); };
    try { database.exec('PRAGMA foreign_keys=ON'); }
    catch (error) { database.close(); throw error; }
    return {
        async query(sql, params = []) {
            checkOpen();
            const bindings = Array.isArray(params) ? params : [params];
            return database.prepare(sql).all(...bindings).map(row => ({...row}));
        },
        async execute(sql, params = []) {
            checkOpen();
            if (Object.keys(params).length) {
                const bindings = Array.isArray(params) ? params : [params];
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
