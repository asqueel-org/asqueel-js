// Port of asqueel.runtime._connection_settings for the main connection: the
// checks a database build applies to its connection declaration. Nothing connects.
const fail = message => { throw new Error(message); };
const DRIVER_FIELDS = ['connect_timeout', 'application_name', 'sslmode', 'sslrootcert',
    'options', 'timeout', 'cached_statements', 'foreignKeys'];

/** [implementation, conninfo, options] of a bound source ``db`` root, as Python reads them. */
export function connectionSettings(db) {
    const value = (attributes, key) => attributes?.[key] ?? null;
    const node = db.children.find(n => n.label === 'connection');
    const config = key => value(db.attributes, key);
    const read = key => value(node?.attributes, key);
    const databaseImplementation = config('implementation') ?? 'sqlite';
    const name = node ? read('name') ?? 'main' : null;
    if (!node) {
        if (db.children.some(n => n.tag === 'connection')) fail('Named connections require an explicit main connection');
        return [databaseImplementation, config('conninfo') ?? '', config('connect_kwargs')];
    }
    const implementation = read('implementation') ?? databaseImplementation;
    if (config('conninfo') || config('connect_kwargs')) fail('Use connection or legacy conninfo/connect_kwargs, not both');
    const driver = node.children.find(n => n.tag === 'options')?.children.find(n => n.tag === 'driver');
    const options = Object.fromEntries(DRIVER_FIELDS.filter(f => value(driver?.attributes, f) != null)
        .map(f => [f, driver.attributes[f]]));
    const database = read('database'), dsn = read('dsn');
    if (Object.hasOwn(node.attributes, 'database') && database == null) fail('connection.database must resolve to a nonempty database name');
    if (Object.hasOwn(node.attributes, 'dsn') && dsn == null) fail('connection.dsn must resolve to a nonempty string');
    if ((database != null || dsn != null) && implementation !== databaseImplementation)
        fail('Named connections must use the database dialect');
    if (dsn != null) {
        if (database != null || ['host', 'port', 'user', 'password'].some(k => read(k) != null))
            fail('dsn and individual connection fields cannot be combined');
        if (typeof dsn !== 'string' || !dsn.trim()) fail('connection.dsn must resolve to a nonempty string');
        if (!['postgres', 'postgres3'].includes(implementation.split(':')[0])) fail('dsn requires a PostgreSQL connection');
        return [implementation, dsn, options];
    }
    const dbname = database ?? name;
    if (typeof dbname !== 'string' || !dbname.trim()) fail('connection.name must resolve to a nonempty database name');
    options.dbname = dbname;
    if (implementation.split(':')[0] === 'sqlite') {
        if (['host', 'port', 'user', 'password'].some(k => read(k) != null))
            fail('SQLite uses a filename, not host/user/password/port');
        if (Object.keys(options).some(k => !['dbname', 'timeout', 'cached_statements', 'foreignKeys'].includes(k)))
            fail('Unsupported SQLite connection options');
        return [implementation, '', options];
    }
    for (const key of ['host', 'port', 'user', 'password']) {
        const item = read(key);
        if (item == null) continue;
        if (key === 'port' ? !Number.isInteger(item) : typeof item !== 'string')
            fail(`connection.${key} resolved to an invalid type`);
        options[key] = item;
    }
    return [implementation, '', options];
}
