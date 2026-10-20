// Semantic relations and alias targets from Python model.py. No SQL execution.
import {names} from './structures.js';
import {defaults} from './options.js';

const copy = value => structuredClone(value);
const fail = (path, message) => { throw new Error(`${path}: ${message}`); };
const dtype = column => column.a.dtype || (column.a.size ? 'A' : 'T');

export function relationAttributes(a) {
    const attributes = {...Object.fromEntries(Object.entries(defaults('relation'))
        .filter(([k, v]) => v != null && !(k === 'indexed' && !a.foreign_key))), ...copy(a)};
    if (a.name) attributes.x_name = a.name;
    if (a.inverse) attributes.back_reference = a.inverse;
    return attributes;
}

export function resolveModelRelations(tables, entries, target) {
    for (const table of tables.values()) {
        table.relations = new Map();
        for (const {owner, node} of entries(table)) {
            const a = node.a, remote = target(tables, a.to, table.key);
            const attributes = relationAttributes(a);
            const name = attributes.x_name || owner.a.name;
            if (table.relations.has(name)) fail(table.key, `duplicate relation ${name}`);
            table.relations.set(name, {name, target: remote.table.key,
                columns: owner.tag === 'compositeColumn' ? names(owner.a.columns) : [owner.a.name],
                target_columns: remote.cols, kind: a.x_weak ? 'weak' : 'relation', attributes});
        }
    }
    // Build inverses from forward declarations only, before virtual paths resolve.
    const forward = [...tables.values()].flatMap(table => [...table.relations.values()].map(relation => ({table, relation})));
    for (const {table, relation} of forward) {
        const name = relation.attributes.inverse || relation.attributes.back_reference;
        if (!name) continue;
        const remote = tables.get(relation.target);
        if (remote.relations.has(name)) fail(remote.key, `duplicate inverse relation ${name}`);
        remote.relations.set(name, {name, target: table.key, columns: [...relation.target_columns],
            target_columns: [...relation.columns], kind: 'inverse', attributes: {...copy(relation.attributes), forward: relation.name}});
    }
    let pending = [...tables.values()].flatMap(table => table.declarations
        .filter(d => d.kind === 'virtualRelation').map(declaration => ({table, declaration})));
    while (pending.length) {
        const next = [];
        for (const {table, declaration} of pending) {
            const a = declaration.attributes, path = `${table.key}.${declaration.name}`;
            if (!!a.relation === !!a.table) fail(path, 'specify either relation or table');
            if (a.table && !a.condition) fail(path, 'conditional relation requires condition');
            let targetKey = a.table;
            if (a.relation) {
                targetKey = table.key;
                for (const part of a.relation.split('.')) {
                    targetKey = tables.get(targetKey).relations.get(part.replace(/^@+/, ''))?.target;
                    if (!targetKey) break;
                }
                if (!targetKey) { next.push({table, declaration}); continue; }
            }
            if (!tables.has(targetKey)) fail(path, `unknown target ${targetKey}`);
            if (table.relations.has(declaration.name)) fail(path, 'duplicate relation');
            table.relations.set(declaration.name, {name: declaration.name, target: targetKey,
                columns: [], target_columns: [], kind: 'virtual', attributes: copy(a)});
        }
        if (next.length === pending.length) fail(next.map(p => `${p.table.key}.${p.declaration.name}`).join(', '), 'unknown or cyclic virtual relations');
        pending = next;
    }
    resolveAliases(tables);
}

function resolveAliases(tables) {
    const resolved = new Map(), visiting = new Set();
    const resolve = (table, name) => {
        const key = `${table.key}.${name}`;
        if (resolved.has(key)) return resolved.get(key);
        const column = table.columns.get(name) || table.virtual.get(name);
        if (!column) fail(key, 'unknown alias target');
        if (column.tag !== 'aliasColumn') return column;
        if (visiting.has(key)) fail(key, 'cyclic alias');
        visiting.add(key);
        const path = column.a.relation_path;
        if (typeof path !== 'string' || !path) fail(key, 'invalid alias path');
        let owner = table, targetName;
        if (path.startsWith('@')) {
            const parts = path.split('.');
            if (parts.length < 2 || parts.some(p => !p)) fail(key, 'invalid alias path');
            for (const part of parts.slice(0, -1)) {
                const relation = owner.relations.get(part.startsWith('@') ? part.slice(1) : part);
                if (!relation) fail(key, `unknown alias relation ${part}`);
                owner = tables.get(relation.target);
            }
            targetName = parts.at(-1);
            if (/^[@$]/.test(targetName)) fail(key, 'invalid alias target');
        } else {
            targetName = path.startsWith('$') ? path.slice(1) : path;
            if (!targetName || targetName.includes('.')) fail(key, 'invalid local alias path');
        }
        const remote = resolve(owner, targetName), inherited = copy(remote.a);
        for (const attr of ['x_identity', 'x_sql_name', 'sql_name', 'sql_formula', 'relation_path', 'provenance',
            'select', 'exists', 'expression', 'parameters', 'subqueries', 'handler', 'x_requires_compilation']) delete inherited[attr];
        for (const attr of Object.keys(inherited)) if (/^(select_|var_)/.test(attr)) delete inherited[attr];
        const result = {...column, a: {...inherited,
            ...Object.fromEntries(Object.entries(column.a).filter(([, v]) => v != null)),
            name, relation_path: path, dtype: column.a.dtype ?? dtype(remote)}, alias_target: [owner.key, targetName]};
        table.virtual.set(name, result);
        resolved.set(key, result);
        visiting.delete(key);
        return result;
    };
    for (const table of tables.values()) for (const name of table.virtual.keys()) resolve(table, name);
}
