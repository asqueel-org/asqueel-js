// Port of asqueel.migration.SqlMigrationRenderer: the prepared source rendered
// as the asqueel-migration ``structure-1.0`` JSON. Only the physical plane
// travels; each entity is filled from an enumerated key set.
import contract from './generated/contract.json' with {type: 'json'};
import {names, clean, entity, hashName, indexItem, constraintItem, relationItem, put} from './structures.js';
import {UnsupportedFeatureError} from './query-errors.js';

const own = (o, k) => Object.hasOwn(o, k);
const fail = message => { throw new Error(message); };
const unsupported = message => { throw new UnsupportedFeatureError(message); };
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const COLLECTIONS = new Set(['packages', 'extensions', 'tables', 'columns', 'composites', 'constraints', 'indexes']);
const PHYSICAL_COLUMNS = new Set(['column']);
const SQL_COLUMN_KEYS = {sql_default: 'sqldefault', sql_extra: 'extra_sql', sql_generatedExpression: 'generated_expression'};
export const SQL_ACTIONS = {c: 'CASCADE', cascade: 'CASCADE', r: 'RESTRICT', restrict: 'RESTRICT',
    n: null, 'no action': null, sn: 'SET NULL', setnull: 'SET NULL', 'set null': 'SET NULL',
    sd: 'SET DEFAULT', setdefault: 'SET DEFAULT', 'set default': 'SET DEFAULT'};
const RELATION_ACTIONS = {onDelete_sql: 'on_delete', onUpdate_sql: 'on_update'};

export const defaultIndexName = (table, columns) => `${table}_${names(columns).join('_')}_key`;
export const packageSqlschema = (attributes, implementation) =>
    attributes.sqlschema || ((implementation || 'sqlite').split(':')[0] === 'sqlite' ? 'main' : 'public');
export function tableSqlname(packageName, packageAttributes, tableName, tableAttributes) {
    if (tableAttributes.sqlname) return String(tableAttributes.sqlname);
    let prefix = packageAttributes.sqlprefix ?? true;
    prefix = prefix === true ? packageName : prefix || '';
    return prefix ? `${prefix}_${tableName}` : tableName;
}

/** The ``sql_*`` column attributes on an implementation; ``sql_<dialect>_<name>`` wins on its dialect. */
export function sqlColumnAttributes(attributes, implementation) {
    const engine = (implementation || 'sqlite').split(':')[0];
    const dialect = engine.startsWith('postgres') ? 'pg' : engine;
    const result = {};
    for (const key of Object.keys(SQL_COLUMN_KEYS)) {
        const specific = `sql_${dialect}_${key.slice(4)}`;
        const value = attributes[specific] ?? attributes[key];
        if (value != null) result[key] = value;
    }
    return result;
}

/** The index attributes ``indexed=`` declares; null when it makes the column unique instead. */
export function indexedAttributes(columns, indexed) {
    const spec = indexed && typeof indexed === 'object' ? {...indexed} : {};
    const withOptions = {};
    for (const key of Object.keys(spec)) if (key.startsWith('with_')) { withOptions[key.slice(5)] = spec[key]; delete spec[key]; }
    const sorting = spec.sorting;
    delete spec.sorting;
    if (spec.unique && !spec.where) return null;
    const order = sorting ? sorting.split(',') : columns.map(() => null);
    const attributes = {columns: Object.fromEntries(columns.map((c, i) => [c, order[i] ?? null]))};
    for (const [key, value] of Object.entries(spec)) if (value) attributes[key] = value;
    if (Object.keys(withOptions).length) attributes.with_options = withOptions;
    return attributes;
}

function packageStorage(dtype, attributes) {
    dtype = {X: 'T', Z: 'T', P: 'T'}[dtype] || dtype;
    const size = attributes.size;
    if (size) {
        if (size.includes(':')) { attributes.size = '0:' + size.split(':')[1]; dtype = 'A'; }
        else if (!size.includes(',')) {
            if (['A', 'T'].includes(dtype)) dtype = 'C';
            else if (dtype === 'N') attributes.size = size + ',0';
        }
    } else if (['A', 'C'].includes(dtype)) dtype = 'T';
    return dtype;
}

function refuseUncovered(schema, table, columns, existing, attributes) {
    if (!existing) return;
    const strip = a => Object.fromEntries(Object.entries(a).filter(([k]) => k !== 'index_name'));
    if (attributes && JSON.stringify(strip(existing.attributes)) !== JSON.stringify(strip(attributes)))
        unsupported(`${schema}.${table}: indexed={...} on ${columns} conflicts with the explicit index on the same columns; declare the options in one of them`);
    if (existing.attributes.where || ![undefined, null, 'btree'].includes(existing.attributes.method))
        unsupported(`${schema}.${table}: partial/non-btree index does not cover required full index on ${columns}; migration engine permits one index per column set`);
}

function fillAutoIndexes(schema, table, item, autoIndexes, pkey) {
    for (const [key, attributes] of autoIndexes) {
        const columns = JSON.parse(key);
        if (same(columns, pkey) || columns.length === 1 &&
            (pkey.includes(columns[0]) || item.columns[columns[0]].attributes.unique)) continue;
        const index = indexItem(schema, table, columns,
            attributes || {columns: Object.fromEntries(columns.map(c => [c, null]))});
        refuseUncovered(schema, table, columns, item.indexes[index.entity_name], attributes && index.attributes);
        if (!own(item.indexes, index.entity_name)) put(item.indexes, index.entity_name, index);
    }
}

function columnItem(schema, table, column, source, pkey, implementation) {
    const attributes = {};
    for (const key of contract.columnKeys) if (source[key] != null) attributes[key] = source[key];
    for (const [key, value] of Object.entries(sqlColumnAttributes(source, implementation)))
        attributes[SQL_COLUMN_KEYS[key]] = value;
    attributes.dtype = attributes.dtype || (attributes.size ? 'A' : 'T');
    attributes.dtype = packageStorage(attributes.dtype, attributes);
    if (pkey.includes(column)) {
        attributes.notnull = '_auto_';
        if (pkey.length === 1) delete attributes.unique;
    }
    return {...entity('column', schema, table, column, clean(attributes)), column_name: column};
}

function renderTable(pkg, node, implementation) {
    const packageName = pkg.attributes.name ?? pkg.name, tableName = node.attributes.name ?? node.name;
    const attributes = node.attributes;
    const schema = attributes.sqlschema || packageSqlschema(pkg.attributes, implementation);
    const sqlname = tableSqlname(packageName, pkg.attributes, tableName, attributes);
    const members = node.children.flatMap(c => COLLECTIONS.has(c.tag) ? c.children : []);
    const columns = members.filter(c => PHYSICAL_COLUMNS.has(c.tag));
    const composites = new Map(members.filter(c => c.tag === 'compositeColumn').map(c => [c.name, c]));
    const physicalName = new Map(columns.map(c => [c.name, c.attributes.sqlname || c.name]));
    const remapped = [...physicalName].some(([a, b]) => a !== b);
    const physical = value => names(value).flatMap(part =>
        composites.has(part) ? names(composites.get(part).attributes.columns) : [part]).map(f => physicalName.get(f));
    const item = {entity: 'table', entity_name: sqlname, attributes: {pkeys: null},
        columns: {}, relations: {}, constraints: {}, indexes: {}, schema_name: schema, table_name: sqlname};
    const pkey = physical(attributes.pkey);
    if (pkey.length) item.attributes.pkeys = pkey.join(',');
    if (attributes.comment) item.attributes.comment = attributes.comment;
    for (const column of columns) put(item.columns, physicalName.get(column.name),
        columnItem(schema, sqlname, physicalName.get(column.name), column.attributes, pkey, implementation));
    const relations = [], autoIndexes = new Map();
    for (const owner of [...columns, ...composites.values()]) {
        const ownerColumns = owner.tag === 'compositeColumn' ? physical(owner.attributes.columns) : [physicalName.get(owner.name)];
        for (const relation of owner.children.filter(c => c.tag === 'relation')) {
            if (!relation.attributes.foreign_key) continue;
            const key = JSON.stringify(ownerColumns);
            if ((relation.attributes.indexed ?? true) && !autoIndexes.has(key)) autoIndexes.set(key, null);
            relations.push([ownerColumns, relation.attributes]);
        }
    }
    for (const child of members.filter(c => c.tag === 'constraint')) {
        const a = child.attributes;
        let constraint;
        if (a.constraint_type === 'CHECK') {
            if (remapped) unsupported(`${packageName}.${tableName}: CHECK with remapped columns`);
            if (!a.name) fail('CHECK constraints require an explicit constraint_name');
            constraint = constraintItem(schema, sqlname, null, 'CHECK', a.name, a.check_clause);
        } else constraint = constraintItem(schema, sqlname, physical(a.columns), 'UNIQUE', a.name);
        put(item.constraints, constraint.entity_name, constraint);
    }
    for (const composite of composites.values()) {
        if (!composite.attributes.unique) continue;
        const constraint = constraintItem(schema, sqlname, physical(composite.attributes.columns), 'UNIQUE');
        if (!own(item.constraints, constraint.entity_name)) put(item.constraints, constraint.entity_name, constraint);
    }
    for (const child of members.filter(c => c.tag === 'index')) {
        const a = child.attributes, declared = a.columns;
        const dictionary = declared && typeof declared === 'object' && !Array.isArray(declared);
        const indexColumns = dictionary
            ? Object.fromEntries(Object.entries(declared).map(([f, o]) => [physicalName.get(f), o]))
            : Object.fromEntries(physical(declared).map(c => [c, null]));
        if (a.where && remapped) unsupported(`${packageName}.${tableName}: partial index with remapped columns`);
        const values = {columns: indexColumns};
        for (const key of contract.indexOptions) if (a[key]) values[key] = structuredClone(a[key]);
        const sourceColumns = dictionary ? Object.keys(declared) : names(declared);
        const index = indexItem(schema, sqlname, Object.keys(indexColumns), values,
            a.name === defaultIndexName(tableName, sourceColumns) ? null : a.name);
        put(item.indexes, index.entity_name, index);
    }
    for (const column of columns) {
        const name = physicalName.get(column.name), indexed = column.attributes.indexed;
        if (!indexed || pkey.includes(name)) continue;
        const spec = indexedAttributes([name], indexed);
        if (spec === null) item.columns[name].attributes.unique = true;
        else autoIndexes.set(JSON.stringify([name]), spec);
    }
    fillAutoIndexes(schema, sqlname, item, autoIndexes, pkey);
    return {key: `${packageName}.${tableName}`, schema, name: sqlname, item, pkey, names: physicalName,
        composites: new Map([...composites].map(([k, c]) => [k, physical(c.attributes.columns)])), relations};
}

function validateStructure(root) {
    const errors = [];
    for (const [schemaName, schema] of Object.entries(root.schemas))
        for (const [tableName, table] of Object.entries(schema.tables)) {
            const where = `schemas.${schemaName}.tables.${tableName}`, columns = table.columns;
            for (const column of (table.attributes.pkeys || '').split(',').filter(Boolean))
                if (!own(columns, column)) errors.push(`${where}: pkey column '${column}' is not a table column`);
            for (const [name, column] of Object.entries(columns)) {
                const a = column.attributes;
                if (a.dtype === 'serial4' && (a.size || a.sqldefault))
                    errors.push(`${where}.columns.${name}: serial4 defines its own size and sequence default`);
                if (a.dtype != null && !contract.dtypeCodes.includes(a.dtype))
                    errors.push(`${where}.columns.${name}: unknown dtype '${a.dtype}'`);
            }
            for (const c of Object.values(table.constraints)) {
                if (c.attributes.constraint_type === 'CHECK') {
                    if (!c.attributes.check_clause) errors.push(`${where}: CHECK requires a check_clause`);
                    continue;
                }
                for (const column of c.attributes.columns || [])
                    if (!own(columns, column)) errors.push(`${where}: column '${column}' is not a table column`);
            }
            for (const r of Object.values(table.relations)) {
                const target = root.schemas[r.attributes.related_schema]?.tables[r.attributes.related_table];
                if (!target) { errors.push(`${where}: relation target not in structure`); continue; }
                for (const column of r.attributes.related_columns)
                    if (!own(target.columns, column)) errors.push(`${where}: related column '${column}' not in target`);
            }
            for (const index of Object.values(table.indexes))
                for (const column of Object.keys(index.attributes.columns || {}))
                    if (!own(columns, column)) errors.push(`${where}: column '${column}' is not a table column`);
        }
    if (errors.length) fail(errors.join('; '));
}

/** The structure-1.0 JSON of a prepared source root; ``foreignKeys=false`` projects no foreign key. */
export function renderMigration(db, {foreignKeys = true} = {}) {
    if (db.tag !== 'db') fail('Migration rendering requires exactly one database root');
    const implementation = db.attributes.implementation;
    const root = {entity: 'db', entity_name: db.attributes.name ?? db.name, schemas: {}, extensions: {}, event_triggers: {}};
    const schemaItem = name => own(root.schemas, name) ? root.schemas[name]
        : put(root.schemas, name, {entity: 'schema', entity_name: name, tables: {}, schema_name: name});
    const packages = db.children.filter(c => c.tag === 'packages').flatMap(c => c.children);
    for (const pkg of packages) schemaItem(packageSqlschema(pkg.attributes, implementation));
    const tables = new Map();
    for (const pkg of packages)
        for (const node of pkg.children.filter(c => c.tag === 'tables').flatMap(c => c.children)) {
            const table = renderTable(pkg, node, implementation);
            put(schemaItem(table.schema).tables, table.name, table.item);
            tables.set(table.key, table);
        }
    const targetIndexes = [];
    for (const table of tables.values())
        for (const [columns, attributes] of table.relations) {
            const parts = String(attributes.related_column).split('.').map(p => p.trim());
            const remote = tables.get(`${parts[0]}.${parts[1]}`);
            const remoteColumns = parts.length === 3
                ? remote.composites.get(parts[2]) || [remote.names.get(parts[2])] : remote.pkey;
            if (!same(remoteColumns, remote.pkey)) targetIndexes.push([remote, remoteColumns]);
            if (!attributes.foreign_key || !foreignKeys) continue;
            const values = {related_schema: remote.schema, related_table: remote.name,
                related_columns: remoteColumns, constraint_type: 'FOREIGN KEY'};
            for (const [key, out] of Object.entries(RELATION_ACTIONS)) {
                // GenroPy onUpdate_sql defaults to cascade.
                const value = attributes[key] || (key === 'onUpdate_sql' ? 'cascade' : null);
                if (value && SQL_ACTIONS[value.toLowerCase()]) values[out] = SQL_ACTIONS[value.toLowerCase()];
            }
            if (attributes.deferrable || attributes.deferred) values.deferrable = true;
            if (attributes.initially_deferred || attributes.deferred) values.initially_deferred = true;
            const relation = relationItem(table.schema, table.name, columns, values, attributes.constraint_name);
            put(table.item.relations, relation.entity_name, relation);
        }
    for (const [remote, columns] of targetIndexes) {
        const item = remote.item;
        if (columns.length === 1 && item.columns[columns[0]].attributes.unique) continue;
        if (Object.values(item.constraints).some(c => c.attributes.constraint_type === 'UNIQUE'
            && same(c.attributes.columns || [], columns))) continue;
        const index = indexItem(remote.schema, remote.name, columns, {columns: Object.fromEntries(columns.map(c => [c, null]))});
        refuseUncovered(remote.schema, remote.name, columns, item.indexes[index.entity_name], null);
        if (!own(item.indexes, index.entity_name)) put(item.indexes, index.entity_name, index);
    }
    for (const extension of db.children.filter(c => c.tag === 'extensions').flatMap(c => c.children))
        put(root.extensions, extension.attributes.name ?? extension.name, {entity: 'extension', entity_name: extension.attributes.name ?? extension.name, attributes: {}});
    validateStructure(root);
    return {root};
}

export {hashName};
