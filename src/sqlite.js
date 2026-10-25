// SQLite migration slice: additive DDL, real catalog introspection and atomic
// postcondition checks. All I/O goes through async query()/execute().
import {clean, put, names, entity, indexItem, relationItem, constraintItem} from './structures.js';

const TYPES = {A: 'character varying', B: 'boolean', C: 'character', D: 'date',
    DH: 'timestamp', DHZ: 'timestamp with time zone', H: 'time', I: 'integer',
    L: 'bigint', N: 'numeric', O: 'blob', R: 'real', T: 'text', jsonb: 'jsonb'};
const REVERSE = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [v, k]));
Object.assign(REVERSE, {char: 'C', varchar: 'A', 'timestamp without time zone': 'DH', 'time without time zone': 'H'});
export const quote = name => `"${String(name).replaceAll('"', '""')}"`;
const full = table => `"main".${quote(table)}`;
const list = columns => columns.map(quote).join(', ');
const canonical = value => value && typeof value === 'object'
    ? Array.isArray(value) ? value.map(canonical)
        : Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
export const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const attrsWithoutName = a => Object.fromEntries(Object.entries(a).filter(([k]) => !['constraint_name', 'index_name'].includes(k)));
const fail = message => { throw new Error(message); };

function declaredType(a) {
    let dtype = a.dtype;
    let size = a.size;
    if (dtype !== 'N' && size) {
        if (size.includes(':')) { size = size.split(':')[1]; dtype = 'A'; }
        else dtype = 'C';
    }
    if (!Object.hasOwn(TYPES, dtype)) fail(`Unsupported SQLite type: ${dtype}`);
    if (size && !/^\d+(?:,\d+)?$/.test(size)) fail(`Invalid SQLite size: ${size}`);
    return TYPES[dtype] + (size ? `(${size})` : '');
}

function reverseType(text) {
    const match = /^([a-z ]+?)\s*(?:\(([^)]*)\))?$/.exec(text.trim().toLowerCase());
    const dtype = REVERSE[match?.[1]?.trim()];
    if (!dtype) fail(`Unrecognized SQLite type: ${text}`);
    return clean({dtype, size: ['A', 'C', 'N'].includes(dtype) && match[2]
        ? (dtype === 'A' ? `0:${match[2]}` : match[2]) : null});
}

function empty(dbname) {
    return {root: {entity: 'db', entity_name: dbname, schemas: {
        main: {entity: 'schema', entity_name: 'main', tables: {}, schema_name: 'main'},
    }, extensions: {}, event_triggers: {}}};
}

// Quote/comment masking preserves offsets for reading constraint clauses without
// interpreting keywords in quoted identifiers or string literals.
function mask(sql) {
    return sql.replace(/'(?:''|[^'])*'|"(?:\"\"|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?\*\//g,
        text => text.replace(/[^\n]/g, '_'));
}
function bodyItems(sql) {
    const masked = mask(sql), items = [];
    let start = masked.indexOf('(') + 1, depth = 0;
    for (let i = start; i < masked.length; i++) {
        const ch = masked[i];
        if (ch === '(') depth++;
        else if (ch === ')' && depth) depth--;
        else if (',)'.includes(ch) && !depth) {
            items.push({text: sql.slice(start, i), masked: masked.slice(start, i)});
            start = i + 1;
            if (ch === ')') break;
        }
    }
    return items;
}
function identifiers(text) {
    return (text.match(/"(?:\"\"|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|[^,\s]+/g) || []).map(s =>
        s[0] === '"' || s[0] === '`' ? s.slice(1, -1).replaceAll(s[0] + s[0], s[0])
            : s[0] === '[' ? s.slice(1, -1) : s);
}
function fkDeferral(sql, columns) {
    for (const item of bodyItems(sql)) {
        const reference = /\bREFERENCES\b/i.exec(item.masked);
        if (!reference) continue;
        const head = /\bFOREIGN\s+KEY\s*\(([^)]*)\)/i.exec(item.masked);
        const local = head ? identifiers(item.text.slice(head.index + head[0].indexOf('(') + 1,
            head.index + head[0].lastIndexOf(')'))) : identifiers(item.text.trim())[0] && [identifiers(item.text.trim())[0]];
        if (!equal(local?.map(s => s.toLowerCase()), columns.map(s => s.toLowerCase()))) continue;
        const clause = /(NOT\s+)?DEFERRABLE(?:\s+INITIALLY\s+(DEFERRED|IMMEDIATE))?/i.exec(item.masked.slice(reference.index));
        return clean({deferrable: !!clause && !clause[1],
            initially_deferred: !!clause && !clause[1] && clause[2]?.toUpperCase() === 'DEFERRED'});
    }
    return {};
}

/** Read actual SQLite catalog. No saved desired-model metadata is consulted. */
export async function readSQLite(adapter, dbname = 'browser') {
    const structure = empty(dbname), tables = structure.root.schemas.main.tables;
    const catalog = await adapter.query("SELECT type,name,tbl_name,sql FROM main.sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name");
    if (catalog.some(n => n.type === 'trigger' || n.type === 'view')) fail('Existing triggers and views are not supported');
    for (const row of catalog.filter(n => n.type === 'table')) {
        const masked = mask(row.sql);
        if (/\b(CHECK|COLLATE|VIRTUAL|WITHOUT\s+ROWID|STRICT)\b/i.test(masked)) fail(`${row.name}: unsupported SQLite definition`);
        const cols = await adapter.query(`PRAGMA main.table_xinfo(${quote(row.name)})`);
        if (cols.some(c => c.hidden)) fail(`${row.name}: generated columns are not supported`);
        const pk = cols.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name);
        const t = put(tables, row.name, {...entity('table', 'main', row.name, row.name, clean({pkeys: pk.join(',')})),
            columns: {}, indexes: {}, constraints: {}, relations: {}});
        for (const col of cols) put(t.columns, col.name, {
            ...entity('column', 'main', row.name, col.name, clean({...reverseType(col.type),
                notnull: col.pk ? '_auto_' : !!col.notnull, sqldefault: col.dflt_value})), column_name: col.name,
        });
        for (const idx of await adapter.query(`PRAGMA main.index_list(${quote(row.name)})`)) {
            if (idx.origin === 'pk') continue;
            const info = (await adapter.query(`PRAGMA main.index_xinfo(${quote(idx.name)})`)).filter(c => c.key);
            if (info.some(c => c.name == null || c.coll !== 'BINARY')) fail(`${idx.name}: expression or collation indexes are not supported`);
            const cols = info.map(c => c.name);
            if (idx.origin === 'u' || idx.unique && idx.name.startsWith('cst_')) {
                if (cols.length === 1) {
                    if (!(pk.length === 1 && pk[0] === cols[0])) t.columns[cols[0]].attributes.unique = true;
                } else {
                    const item = constraintItem('main', row.name, cols, 'UNIQUE', idx.name);
                    put(t.constraints, item.entity_name, item);
                }
            } else {
                // The Python reader currently loses unique on explicit UNIQUE
                // indexes. Refuse them instead of claiming a false parity.
                if (idx.unique) fail(`${idx.name}: declare UNIQUE on the column or a constraint, not on the index`);
                const sql = catalog.find(n => n.type === 'index' && n.name === idx.name)?.sql || '';
                const where = /\)\s+WHERE\s+(.+)$/is.exec(sql)?.[1]?.trim();
                const item = indexItem('main', row.name, cols, clean({
                    columns: Object.fromEntries(info.map(c => [c.name, c.desc ? 'DESC' : null])), where,
                }), idx.name);
                put(t.indexes, item.entity_name, item);
            }
        }
        const groups = new Map();
        for (const fk of await adapter.query(`PRAGMA main.foreign_key_list(${quote(row.name)})`)) {
            if (!groups.has(fk.id)) groups.set(fk.id, []);
            groups.get(fk.id).push(fk);
        }
        for (const rows of groups.values()) {
            rows.sort((a, b) => a.seq - b.seq);
            const first = rows[0], cols = rows.map(r => r.from);
            let remote = rows.map(r => r.to);
            if (remote.some(c => c == null)) remote = (await adapter.query(`PRAGMA main.table_info(${quote(first.table)})`))
                .filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name);
            const item = relationItem('main', row.name, cols, {
                constraint_type: 'FOREIGN KEY', related_schema: 'main', related_table: first.table,
                related_columns: remote, on_delete: first.on_delete, on_update: first.on_update,
                ...fkDeferral(row.sql, cols),
            });
            put(t.relations, item.entity_name, item);
        }
    }
    return structure;
}

function prepareDesired(structure) {
    const desired = structuredClone(structure), warnings = [];
    if (!desired.root?.schemas || Object.keys(desired.root.schemas).some(s => s !== 'main')) {
        fail('SQLite requires implementation "sqlite" and the main schema only');
    }
    for (const key of ['extensions', 'event_triggers']) {
        if (Object.keys(desired.root[key] || {}).length) fail(`${key}: not supported by the SQLite migrator`);
    }
    const tables = desired.root.schemas.main?.tables || {};
    for (const [name, table] of Object.entries(tables)) {
        if (!Object.keys(table.columns).length) fail(`${name}: a table must have columns`);
        if (table.attributes.comment) { warnings.push(`${name}: comment not stored by SQLite`); delete table.attributes.comment; }
        for (const [key, column] of Object.entries(table.columns)) {
            const a = column.attributes;
            if (a.comment) { warnings.push(`${name}.${key}: comment not stored by SQLite`); delete a.comment; }
            for (const attribute of Object.keys(a)) if (!['dtype', 'size', 'notnull', 'unique', 'sqldefault'].includes(attribute)) {
                fail(`${name}.${key}: attribute ${attribute} not supported by SQLite`);
            }
            const stored = reverseType(declaredType(a));
            if (!equal(stored, clean({dtype: a.dtype, size: a.size}))) fail(`${name}.${key}: use the physical type ${JSON.stringify(stored)}`);
        }
        for (const c of Object.values(table.constraints)) if (c.attributes.constraint_type !== 'UNIQUE') fail(`${name}: only UNIQUE constraints are supported`);
        for (const fk of Object.values(table.relations)) {
            if (fk.attributes.related_schema !== 'main') fail(`${name}: cross-database foreign keys are not supported`);
        }
        for (const idx of Object.values(table.indexes)) {
            const a = idx.attributes;
            if (a.unique || a.method && a.method !== 'btree' || a.with || a.tablespace) fail(`${name}: unsupported index options`);
            // Explicit ASC and absence of ordering have identical SQLite semantics.
            for (const col of Object.keys(a.columns)) if (a.columns[col] === 'ASC') a.columns[col] = null;
        }
    }
    return {desired, warnings};
}

export function sqliteColumnSQL(name, a) {
    return `${quote(name)} ${declaredType(a)}${a.sqldefault != null ? ` DEFAULT ${a.sqldefault}` : ''}${a.notnull ? ' NOT NULL' : ''}${a.unique ? ' UNIQUE' : ''}`;
}
function createTableSQL(name, table) {
    const defs = Object.entries(table.columns).map(([n, c]) => sqliteColumnSQL(n, c.attributes));
    if (table.attributes.pkeys) defs.push(`PRIMARY KEY (${list(names(table.attributes.pkeys))})`);
    for (const {attributes: a} of Object.values(table.constraints)) {
        defs.push(`CONSTRAINT ${quote(a.constraint_name)} UNIQUE (${list(a.columns)})`);
    }
    for (const {attributes: a} of Object.values(table.relations)) {
        let sql = `CONSTRAINT ${quote(a.constraint_name)} FOREIGN KEY (${list(a.columns)}) REFERENCES ${quote(a.related_table)} (${list(a.related_columns)})`;
        for (const action of ['delete', 'update']) if (a[`on_${action}`]) {
            const value = a[`on_${action}`];
            if (!['CASCADE', 'RESTRICT', 'SET NULL', 'SET DEFAULT', 'NO ACTION'].includes(value)) fail(`Invalid foreign key action: ${value}`);
            sql += ` ON ${action.toUpperCase()} ${value}`;
        }
        if (a.deferrable) sql += ` DEFERRABLE${a.initially_deferred ? ' INITIALLY DEFERRED' : ''}`;
        defs.push(sql);
    }
    return `CREATE TABLE ${full(name)} (\n  ${defs.join(',\n  ')}\n);`;
}
function createIndexSQL(table, a) {
    const columns = Object.entries(a.columns).map(([name, order]) => {
        if (order && !['ASC', 'DESC'].includes(order)) fail('Invalid index ordering');
        return quote(name) + (order ? ` ${order}` : '');
    });
    return `CREATE INDEX "main".${quote(a.index_name)} ON ${quote(table)} (${columns.join(', ')})${a.where ? ` WHERE ${a.where}` : ''};`;
}

/** Returns a reviewable plan. Existing tables/columns are never dropped. */
export function diffSQLite(structure, current) {
    const {desired, warnings} = prepareDesired(structure), statements = [], blocked = [];
    const wanted = desired.root.schemas.main?.tables || {}, actual = current.root.schemas.main?.tables || {};
    const reserved = new Map();
    for (const [tn, t] of Object.entries(actual)) for (const idx of Object.values(t.indexes)) reserved.set(idx.attributes.index_name.toLowerCase(), tn);
    for (const [name, t] of Object.entries(wanted)) {
        const old = Object.hasOwn(actual, name) ? actual[name] : null;
        if (!old) {
            if (Object.keys(actual).some(n => n.toLowerCase() === name.toLowerCase())) blocked.push(`${name}: SQLite name collision`);
            else statements.push(createTableSQL(name, t));
        } else {
            if (!equal(t.attributes, old.attributes)) blocked.push(`${name}: primary key change not supported`);
            for (const [n, c] of Object.entries(t.columns)) {
                if (!Object.hasOwn(old.columns, n)) {
                    if (Object.keys(old.columns).some(k => k.toLowerCase() === n.toLowerCase())) blocked.push(`${name}.${n}: name collision`);
                    else if (c.attributes.unique || c.attributes.notnull || names(t.attributes.pkeys).includes(n)) {
                        blocked.push(`${name}.${n}: adding a UNIQUE, NOT NULL or primary key column requires a dedicated migration`);
                    } else statements.push(`ALTER TABLE ${full(name)} ADD COLUMN ${sqliteColumnSQL(n, c.attributes)};`);
                } else if (!equal(c.attributes, old.columns[n].attributes)) blocked.push(`${name}.${n}: change of type, default or constraints not supported`);
            }
            for (const n of Object.keys(old.columns)) if (!Object.hasOwn(t.columns, n)) blocked.push(`${name}.${n}: column removal not supported`);
            for (const group of ['constraints', 'relations']) {
                const semantic = values => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, attrsWithoutName(v.attributes)]));
                if (!equal(semantic(t[group]), semantic(old[group]))) blocked.push(`${name}: changing ${group} requires a table rebuild`);
            }
        }
        for (const [id, idx] of Object.entries(t.indexes)) {
            const previous = old?.indexes[id];
            if (!previous) {
                const indexName = idx.attributes.index_name.toLowerCase();
                if (reserved.has(indexName)) blocked.push(`${idx.attributes.index_name}: index name already present`);
                else { reserved.set(indexName, name); statements.push(createIndexSQL(name, idx.attributes)); }
            } else if (!equal(attrsWithoutName(idx.attributes), attrsWithoutName(previous.attributes))) blocked.push(`${name}: change of index ${id} not supported`);
        }
        for (const id of Object.keys(old?.indexes || {})) if (!Object.hasOwn(t.indexes, id)) blocked.push(`${name}: removal of index ${id} not supported`);
    }
    for (const name of Object.keys(actual)) if (!Object.hasOwn(wanted, name)) blocked.push(`${name}: table present in the database but absent from the model`);
    return {statements, blocked, warnings};
}

export async function planSQLite(adapter, desired) {
    const current = await readSQLite(adapter, desired.root.entity_name);
    return {...diffSQLite(desired, current), current};
}

export async function migrateSQLite(adapter, desired) {
    await adapter.execute('BEGIN IMMEDIATE');
    try {
        const plan = await planSQLite(adapter, desired);
        if (plan.blocked.length) fail(plan.blocked.join('\n'));
        for (const sql of plan.statements) await adapter.execute(sql);
        const after = await planSQLite(adapter, desired);
        if (after.statements.length || after.blocked.length) fail(`Final check failed: ${JSON.stringify(after.blocked)}`);
        if ((await adapter.query('PRAGMA main.foreign_key_check')).length) fail('Foreign key violations after the migration');
        await adapter.execute('COMMIT');
        return {executed: plan.statements, warnings: plan.warnings, current: after.current, residual: []};
    } catch (error) {
        await adapter.execute('ROLLBACK');
        throw error;
    }
}
