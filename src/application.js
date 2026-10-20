// Source preparation and physical projection corresponding to model_source.py,
// model_expansion.py, resolve_model() and projection.to_physical_builder().
import {SourceBag} from '@genrojs/builders';
import contract from './generated/contract.json' with {type: 'json'};
import {names, hashName} from './structures.js';
import {defaults, readOptions, expandOptions} from './options.js';

const VIRTUAL = new Set(['formulaColumn', 'aliasColumn', 'subQueryColumn', 'pyColumn', 'bagItemColumn']);
const ALLOWED = new Set(['db', 'schemas', 'schema', 'packages', 'package', 'tables', 'table',
    'columns', 'column', 'composites', 'compositeColumn', 'virtual_columns', ...VIRTUAL,
    'indexes', 'index', 'constraints', 'constraint', 'extensions', 'extension',
    'relation', 'weak_relation', 'options', 'reset', ...Object.keys(contract.optionLevels), 'validation']);
const fail = (path, message) => { throw new Error(`${path}: ${message}`); };
const own = (o, key) => Object.hasOwn(o, key);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = value => structuredClone(value);
const collection = (node, tag) => node.children.find(n => n.tag === tag)?.children || [];

export function isApplicationSource(node) {
    return node.nodeTag === 'packages' || node.nodeTag === 'options'
        || node.value instanceof SourceBag && node.value.getNodes().some(isApplicationSource);
}

function snapshot(builder, node) {
    const tag = node.nodeTag, attrs = node.getAttr();
    if (!ALLOWED.has(tag)) fail(node.fullpath, `<${tag}> is outside the migration PoC`);
    builder.validateNodeValues(tag, node.value, attrs);
    const declared = new Set([...builder.schema[tag].attributes?.parameters?.map(p => p.name),
        ...(attrs._meta?.inherited_attributes || [])]);
    for (const key of Object.keys(attrs)) {
        if (key === '_meta') continue;
        if (key === 'sql_type' || (!declared.has(key) && !(key.includes('_') && !key.startsWith('_')) && tag !== 'validation')) {
            fail(node.fullpath, `unknown attribute ${key}`);
        }
        if (/^x_(partition|draft_field|logical_deletion_field|tenant|store|subtable|virtualRelation|virtual_relation)/.test(key)) {
            fail(node.fullpath, `runtime row policy ${key} is outside this projection`);
        }
    }
    return {tag, a: clone(Object.fromEntries(Object.entries(attrs).filter(([k]) => k !== '_meta'))),
        children: node.value instanceof SourceBag ? node.value.getNodes().map(n => snapshot(builder, n)) : []};
}

function putUnique(map, key, value, path) {
    if (map.has(key)) fail(path, `duplicate declaration ${key}`);
    map.set(key, value);
}

function resolveTypes(table) {
    for (const column of [...table.columns.values(), ...table.virtual.values()]) {
        const dtype = column.a.dtype;
        if (dtype == null || contract.dtypeCodes.includes(dtype)) continue;
        const type = table.package?.options.get(`type_${dtype}`)?.spec;
        if (!type) fail(table.key, `unknown dtype ${dtype}`);
        const {name, ...attributes} = type;
        column.a = {...attributes, ...column.a, dtype: type.dtype};
    }
}

function relations(table) {
    return [...table.columns.values(), ...table.composites.values(), ...table.virtual.values()]
        .flatMap(owner => owner.children.filter(n => ['relation', 'weak_relation'].includes(n.tag)).map(node => ({owner, node})));
}

function target(tables, to, path) {
    const parts = to.split('.'), table = tables.get(parts.slice(0, 2).join('.'));
    if (![2, 3].includes(parts.length) || !table) fail(path, `unknown relation target ${to}`);
    const cols = parts.length === 2 ? names(table.a.pkey) : table.composites.has(parts[2])
        ? names(table.composites.get(parts[2]).a.columns) : [parts[2]];
    if (!cols.length || cols.some(c => !table.columns.has(c))) fail(path, `invalid physical target ${to}`);
    return {table, cols};
}

function isUnique(table, cols) {
    return same(cols, names(table.a.pkey)) || cols.length === 1 && table.columns.get(cols[0])?.a.unique
        || [...table.constraints, ...table.composites.values()].some(n =>
            (n.a.constraint_type === 'UNIQUE' || n.a.unique) && same(cols, names(n.a.columns)))
        || table.indexes.some(n => n.a.unique && !n.a.where && same(cols, names(n.a.columns)));
}

function resolveReferences(tables, packages) {
    const actions = {cascade: 'CASCADE', restrict: 'RESTRICT', no_action: null,
        set_null: 'SET NULL', set_default: 'SET DEFAULT'};
    for (const t of tables.values()) {
        if (t.composites.has(t.a.pkey)) t.a.pkey = t.composites.get(t.a.pkey).a.columns;
        for (const {node} of relations(t)) {
            const a = node.a;
            if (node.tag === 'weak_relation') { node.tag = 'relation'; a.x_weak = true; a.foreign_key = false; }
            const parts = a.to.split('.');
            if (parts.length === 2 && !packages.has(parts[0]) && tables.has(`${t.namespace}.${parts[0]}`)) {
                a.to = `${t.namespace}.${a.to}`;
            }
            if (t.package) {
                a.foreign_key ??= true;
                for (const action of ['on_delete', 'on_update']) {
                    if (a[action] != null && !['CASCADE', 'RESTRICT', 'SET NULL', 'SET DEFAULT'].includes(a[action])) {
                        if (!['raise', 'cascade', 'set_null', 'ignore'].includes(a[action])) fail(t.key, `invalid application action ${a[action]}`);
                        a[`x_app_${action}`] = a[action];
                        delete a[action];
                    }
                    const key = `${action}_sql`;
                    const value = action === 'on_update' && !own(a, key) && a.foreign_key ? 'cascade' : a[key];
                    if (value != null) {
                        const normalized = value.toLowerCase().replaceAll(' ', '_');
                        if (!own(actions, normalized)) fail(t.key, `invalid SQL action ${value}`);
                        a[action] = actions[normalized];
                    }
                }
                if (!own(a, 'deferred') && (a.x_app_on_delete === 'set_null' || a.on_delete === 'SET NULL')) a.deferred = true;
            }
        }
    }
    const count = [...tables.values()].reduce((n, t) => n + relations(t).length, 0);
    for (let pass = 0; pass <= count; pass++) {
        let changed = false;
        for (const t of tables.values()) for (const {owner, node} of relations(t)) {
            const remote = target(tables, node.a.to, t.key);
            if (owner.tag !== 'column' || remote.cols.length !== 1) continue;
            const r = remote.table.columns.get(remote.cols[0]).a;
            const dtype = {serial: 'L', serial4: 'I'}[r.dtype] || r.dtype || (r.size ? 'A' : null);
            if (owner.a.dtype == null && dtype != null) {
                owner.a.dtype = dtype;
                if (owner.a.size == null && r.size != null) owner.a.size = r.size;
                changed = true;
            }
        }
        if (!changed) break;
    }
    for (const t of tables.values()) for (const {owner, node} of relations(t)) {
        const a = node.a, remote = target(tables, a.to, t.key);
        if (a.case_insensitive) fail(t.key, 'case_insensitive relations are outside V1');
        if (!a.x_weak && !isUnique(remote.table, remote.cols)) fail(t.key, 'relation target must have a unique key');
        if (!a.x_weak || a.indexed === false) continue;
        if (VIRTUAL.has(owner.tag)) continue;
        const parts = a.to.split('.');
        const other = parts.length === 3 && remote.table.composites.has(parts[2])
            ? remote.table.composites.get(parts[2]) : remote.cols.length === 1 ? remote.table.columns.get(remote.cols[0]) : null;
        for (const [table, column] of [[t, owner], [remote.table, other]]) {
            if (!column) continue;
            if (column.tag === 'column') column.a.indexed ??= true;
            else if (!column.a.unique) {
                const cols = names(column.a.columns);
                const existing = table.indexes.filter(n => same(names(n.a.columns), cols));
                if (existing.some(n => n.a.where || n.a.method && n.a.method !== 'btree')) fail(table.key, 'partial/non-btree index cannot cover weak relation');
                if (!existing.length) table.indexes.push({tag: 'index', a: {columns: column.a.columns, x_auto_name: true}, children: []});
            }
        }
    }
}

function storage(column, packaged, path) {
    const a = column.a;
    if (a.identity_kind || a.generated || a.default_collation === false || a.owned_sequence || a.sequence_default) fail(path, 'unsupported physical column metadata');
    let dtype = a.dtype || (a.size ? 'A' : 'T');
    const attrs = Object.fromEntries(['size', 'notnull', 'unique', 'indexed', 'sqldefault', 'extra_sql',
        'generated_expression', 'comment'].filter(k => a[k] != null).map(k => [k, a[k]]));
    if (packaged) {
        dtype = {X: 'T', Z: 'T', P: 'T'}[dtype] || dtype;
        if (attrs.size) {
            if (attrs.size.includes(':')) { attrs.size = `0:${attrs.size.split(':')[1]}`; dtype = 'A'; }
            else if (!attrs.size.includes(',')) {
                if (['A', 'T'].includes(dtype)) dtype = 'C';
                else if (dtype === 'N') attrs.size += ',0';
            }
        } else if (['A', 'C'].includes(dtype)) dtype = 'T';
    }
    return {dtype, ...attrs};
}

export function projectApplication(builder, Builder, {withModel = false} = {}) {
    const roots = builder.source.getNodes();
    if (roots.length !== 1 || roots[0].nodeTag !== 'db') fail('model', 'exactly one db root is required');
    const db = snapshot(builder, roots[0]);
    readOptions(db);
    if (collection(db, 'packages').length && db.children.some(n => n.tag === 'schemas')) {
        fail('db', 'package configuration derives schemas from package.sqlschema; remove explicit schemas');
    }
    const schemas = new Map(), packages = new Map(), tables = new Map();
    for (const node of collection(db, 'schemas')) {
        readOptions(node);
        putUnique(schemas, node.a.name, {node, physical: node.a.sqlname || node.a.name}, 'schemas');
    }
    if (new Set([...schemas.values()].map(s => s.physical)).size !== schemas.size) fail('schemas', 'duplicate physical schema');
    for (const node of collection(db, 'packages')) {
        const a = {...defaults('package'), ...node.a}, options = readOptions(node);
        if (typeof a.sqlprefix === 'string' && (!a.sqlprefix || a.sqlprefix.endsWith('_'))) fail(a.name, 'invalid sqlprefix');
        const schema = a.sqlschema || (db.a.implementation === 'sqlite' ? 'main' : 'public');
        if (!schemas.has(schema)) schemas.set(schema, {physical: schema});
        putUnique(packages, a.name, {node, a, schema, options}, 'packages');
    }
    for (const pkg of packages.values()) {
        const requires = pkg.options.get('requires')?.spec.packages;
        for (const name of requires == null ? [] : typeof requires === 'string' ? [requires] : requires) {
            if (!packages.has(name)) fail(pkg.a.name, `missing required package ${name}`);
        }
    }
    for (const container of db.children) for (const namespace of container.children) {
        if (!['schemas', 'packages'].includes(container.tag)) continue;
        for (const node of collection(namespace, 'tables')) {
            const pkg = container.tag === 'packages' ? packages.get(namespace.a.name) : null;
            const key = `${namespace.a.name}.${node.a.name}`;
            const t = {key, namespace: namespace.a.name, a: node.a, package: pkg, options: readOptions(node),
                columns: new Map(), virtual: new Map(), composites: new Map(), constraints: collection(node, 'constraints'),
                indexes: collection(node, 'indexes')};
            for (const collectionNode of node.children) for (const child of collectionNode.children) {
                if (collectionNode.tag === 'options') continue;
                const map = child.tag === 'column' ? t.columns : child.tag === 'compositeColumn' ? t.composites
                    : VIRTUAL.has(child.tag) ? t.virtual : null;
                if (map) putUnique(map, child.a.name, child, key);
                if (child.tag === 'column') for (const declaration of child.children) {
                    if (declaration.tag === 'dynamic_fields') {
                        if (declaration.a.enabled !== false && !declaration.a.source) fail(key, 'column dynamic_fields requires source');
                        if (declaration.a.templates != null) fail(key, 'column dynamic_fields accepts source, not templates');
                    }
                }
            }
            let prefix = pkg ? pkg.a.sqlprefix : node.a.x_sql_prefix ?? namespace.a.x_sql_prefix ?? '';
            if (prefix === true) prefix = `${namespace.a.name}_`;
            else if (prefix === false || prefix == null) prefix = '';
            else if (pkg) prefix += '_';
            if (typeof prefix !== 'string') fail(key, 'invalid SQL prefix');
            const schema = pkg ? node.a.sqlschema || pkg.schema : namespace.a.name;
            if (pkg && !schemas.has(schema)) fail(key, 'table sqlschema is not derived from a package');
            t.sqlschema = pkg ? schemas.get(schema).physical
                : node.a.x_sql_schema || namespace.a.x_sql_schema || schemas.get(schema).physical;
            t.sqlname = node.a.sqlname || node.a.x_sql_name || prefix + node.a.name;
            putUnique(tables, key, t, key);
            resolveTypes(t);
        }
    }
    expandOptions(tables);
    resolveReferences(tables, packages);
    const physical = new Builder(), root = physical.root.db({name: db.a.name});
    const schemaNodes = new Map(), tableNodes = new Map(), columnNodes = new Map();
    const schemaContainer = root.schemas();
    const schemaNode = name => {
        if (!schemaNodes.has(name)) schemaNodes.set(name, schemaContainer.schema({name}).tables());
        return schemaNodes.get(name);
    };
    for (const s of schemas.values()) schemaNode(s.physical);
    const physicalNames = new Set();
    for (const t of tables.values()) {
        const path = `${t.sqlschema}.${t.sqlname}`;
        if (physicalNames.has(path)) fail(t.key, 'duplicate physical table');
        physicalNames.add(path);
        const columnName = name => {
            const c = t.columns.get(name);
            if (!c) fail(t.key, `unknown physical column ${name}`);
            return c.a.sqlname || c.a.x_sql_name || name;
        };
        t.mapColumns = cols => cols.map(columnName);
        const mapped = [...t.columns.keys()].map(columnName);
        if (new Set(mapped).size !== mapped.length) fail(t.key, 'duplicate physical columns');
        const pkey = t.mapColumns(names(t.a.pkey)).join(',');
        const node = schemaNode(t.sqlschema).table({name: t.sqlname, ...(pkey ? {pkey} : {}),
            ...(t.a.comment ? {comment: t.a.comment} : {})});
        tableNodes.set(t.key, node);
        const columns = node.columns(), cn = new Map();
        columnNodes.set(t.key, cn);
        for (const [name, c] of t.columns) cn.set(name, columns.column({
            name: columnName(name), ...storage(c, !!t.package, `${t.key}.${name}`),
        }));
        const remapped = [...t.columns.keys()].some(n => columnName(n) !== n);
        const constraints = [...t.constraints, ...[...t.composites.values()].filter(n => n.a.unique).map(n => ({
            a: {constraint_type: 'UNIQUE', columns: n.a.columns, x_auto_name: true},
        }))];
        if (constraints.length) {
            const container = node.constraints();
            constraints.forEach(({a}, i) => {
                if (a.check_clause && remapped) fail(t.key, 'CHECK with remapped columns');
                container.constraint({name: a.name || `unique_${i}`, constraint_type: a.constraint_type,
                    ...(a.columns ? {columns: t.mapColumns(names(a.columns)).join(',')} : {}),
                    ...(a.check_clause ? {check_clause: a.check_clause} : {}), x_auto_name: a.x_auto_name || false});
            });
        }
        if (t.indexes.length) {
            const container = node.indexes();
            for (const {a} of t.indexes) {
                if (a.where && remapped) fail(t.key, 'partial index with remapped columns');
                const cols = names(a.columns), mapped = t.mapColumns(cols);
                const attrs = Object.fromEntries(contract.indexOptions.filter(k => a[k] != null).map(k => [k, a[k]]));
                container.index({name: a.name || hashName(t.sqlschema, t.sqlname, mapped),
                    x_auto_name: a.x_auto_name || !a.name,
                    columns: typeof a.columns === 'object' ? Object.fromEntries(cols.map((c, i) => [mapped[i], a.columns[c]]))
                        : mapped.join(','), ...attrs});
            }
        }
    }
    let compositeIndex = 0;
    const composites = new Map(), containers = new Map();
    const composite = (t, cols) => {
        const key = JSON.stringify([t.key, cols]);
        if (!composites.has(key)) {
            if (!containers.has(t.key)) containers.set(t.key, tableNodes.get(t.key).composites());
            let name = `_native_key_${compositeIndex++}`;
            while (t.columns.has(name)) name += '_';
            const node = containers.get(t.key).compositeColumn({name, columns: t.mapColumns(cols).join(',')});
            composites.set(key, {name, node});
        }
        return composites.get(key);
    };
    for (const t of tables.values()) for (const {owner, node} of relations(t)) {
        const a = node.a;
        if (!a.foreign_key) continue;
        if (owner.tag !== 'column' && owner.tag !== 'compositeColumn') fail(t.key, 'physical relation on virtual column');
        const remote = target(tables, a.to, t.key);
        let to = `${remote.table.sqlschema}.${remote.table.sqlname}`;
        if (!same(remote.cols, names(remote.table.a.pkey))) {
            to += '.' + (remote.cols.length === 1 ? remote.table.mapColumns(remote.cols)[0] : composite(remote.table, remote.cols).name);
        }
        const cols = owner.tag === 'compositeColumn' ? names(owner.a.columns) : [owner.a.name];
        if (cols.length !== remote.cols.length) fail(t.key, 'relation column counts differ');
        const local = cols.length === 1 ? columnNodes.get(t.key).get(cols[0]) : composite(t, cols).node;
        local.relation({to, foreign_key: true, ...Object.fromEntries(
            ['on_delete', 'on_update', 'deferrable', 'initially_deferred', 'deferred', 'indexed', 'constraint_name']
                .filter(k => a[k] != null).map(k => [k, a[k]]))});
    }
    const extensions = collection(db, 'extensions');
    if (extensions.length) {
        const container = root.extensions();
        for (const n of extensions) container.extension({name: n.a.name});
    }
    return withModel ? {physical, tables} : physical;
}
