// Python hierarchical.py / table_behaviors.py, inside the write transaction.
import {equal, quote} from './sqlite.js';
import {compileWrite, keyColumns} from './write-compiler.js';
import {names} from './structures.js';

export const behavior = (table, name) => {
    const spec = table.options.get(name)?.spec;
    return spec && spec.enabled !== false ? spec : null;
};
const get = (record, key) => record?.[key] ?? null;
const changed = (fields, a, b) => fields.some(k => !equal(get(a, k), get(b, k)));
// Legacy tblobj.attributes['hierarchical']: the declared hierarchical columns, then pkey.
const tracked = table => {
    const columns = behavior(table, 'hierarchical').columns;
    const declared = typeof columns === 'string' ? names(columns) : columns || [];
    return [...declared.map(item => typeof item === 'object' ? item.name : item).filter(n => n !== 'pkey'), 'pkey'];
};
// Legacy copyFromParent columns: _virtual_node and the linked master key.
function copiedFromParent(db, table) {
    const spec = behavior(table, 'hierarchical'), result = spec.virtual_roots ? ['_virtual_node'] : [];
    if (spec.linked_to) {
        const key = spec.linked_to.includes('.') ? spec.linked_to : `${table.namespace}.${spec.linked_to}`;
        const master = db.resolveTable(key, false);
        result.push(`${master.a.name}_${master.a.pkey}`);
    }
    return result;
}
const pyString = value => value == null ? 'None' : value === true ? 'True' : value === false ? 'False' : String(value);
export function typedRows(table, rows) {
    for (const row of rows) for (const [name, col] of table.columns)
        if (col.a.dtype === 'B' && row[name] != null) row[name] = Boolean(row[name]);
    return rows;
}
export async function behaviorRows(db, table, options = {}) {
    const rows = await db.table(table.key).query({columns: [...table.columns.keys()].map(n => '$' + n).join(','),
        exclude_draft: false, exclude_logical_deleted: false, ignore_partition: true,
        addPkeyColumn: false, order_by: '', ...options}).fetch();
    return typedRows(table, rows);
}
export async function nextCounter(db, table, field, scope, record) {
    const names = Array.isArray(scope) ? scope : scope ? scope.split(',').map(s => s.trim()).filter(Boolean) : [];
    const params = {}, predicates = names.map((name, i) => {
        if (!table.columns.has(name)) throw new Error(`${table.key}: counter scope must be a physical column: ${name}`);
        if (get(record, name) == null) return `$${name} IS NULL`;
        params[`scope_${i}`] = record[name];
        return `$${name} = :scope_${i}`;
    });
    const rows = await behaviorRows(db, table, {columns: `MAX($${field}) AS counter_max`,
        where: predicates.join(' AND ') || null, sqlparams: params});
    return (rows[0].counter_max || 0) + 1;
}
export function encode36(number, width = 1) {
    const value = number.toString(36).toUpperCase();
    return value.length > width ? '' : value.padStart(width, '0');
}
export async function hierarchyBefore(db, table, record, old = null, allocate = true) {
    const current = {...old, ...record}, spec = behavior(table, 'hierarchical');
    const parentField = spec.parent ?? 'parent_id', counter = behavior(table, 'counter')?.field ?? '_row_count';
    const key = String(current[table.a.pkey]).trimEnd(), parentId = get(current, parentField);
    if (key.includes('/')) throw new Error('Hierarchical primary keys cannot contain /');
    if (old && key !== String(old[table.a.pkey]).trimEnd()) throw new Error('Hierarchical primary keys are unmodifiable');
    const cycle = () => { throw new Error('A node cannot be moved under itself or one of its descendants'); };
    if (parentId != null && String(parentId).trimEnd() === key) cycle();
    const moved = old != null && changed([parentField], current, old), hasCounter = table.columns.has(counter);
    const next = allocate && hasCounter && (moved || (old == null && get(record, counter) == null));
    // Keep Python's SQLite locking statements as well as the outer BEGIN IMMEDIATE.
    const parent = parentId ? (await behaviorRows(db, table, {where: `$${table.a.pkey}=:pid`, sqlparams: {pid: parentId}}))[0] : null;
    if (!parentId && next) await lockTable(db, table);
    if (parentId != null && !parent) throw new Error('Unknown hierarchical parent');
    if (parent && parent.hierarchical_pkey.split('/').includes(key)) cycle();
    if (next) record[counter] = current[counter] = await nextCounter(db, table, counter, [parentField], current);
    const positioned = old == null || changed([counter], current, old);
    if (hasCounter && positioned && (current[counter] || 0) > 1295) throw new Error('at most 1295 siblings under one parent');
    if (hasCounter && (!Number.isInteger(current[counter]) || current[counter] < 0)) throw new Error('Hierarchical counters require a nonnegative integer');
    for (const field of tracked(table)) {
        const name = 'hierarchical_' + field, value = field === 'pkey' ? key : get(current, field);
        record['_parent_h_' + field] = parent ? parent[name] : null;
        record[name] = parent ? `${pyString(parent[name])}/${pyString(value)}` : value;
    }
    if (spec.root_id) record.root_id = record.hierarchical_pkey.split('/')[0];
    if (parent) for (const name of copiedFromParent(db, table)) record[name] = parent[name];
    if (!hasCounter) return;
    record._parent_h_count = current._parent_h_count = parent ? parent._h_count : null;
    if (old == null || changed([counter, '_parent_h_count'], current, old))
        record._h_count = (record._parent_h_count || '') + encode36(current[counter], 2);
}
export async function hierarchyAfter(db, table, record, old) {
    if (!old) throw new Error('Updating a hierarchical record requires old_record');
    const copied = copiedFromParent(db, table), current = {...old, ...record}, fields = [...table.columns.keys()].filter(name =>
        name.startsWith('hierarchical_') || name === '_h_count' || copied.includes(name));
    if (!changed(fields, current, old)) return;
    const parent = behavior(table, 'hierarchical').parent ?? 'parent_id';
    const children = await behaviorRows(db, table, {where: `$${parent}=:parent`, sqlparams: {parent: current[table.a.pkey]}});
    for (const row of children) await db.table(table.key).update({...row}, {old_record: row, ignore_partition: true});
}
function target(db, table, field) {
    const to = table.columns.get(field).children.find(c => c.tag === 'relation').a.related_column;
    return db.resolveTable(to.split('.').slice(0, 2).join('.'), false);
}
async function relativeIndex(db, table, record, field) {
    if (get(record, field) != null) return;
    const name = behavior(table, 'relidx').relation.replace(/^@+/, '');
    const extension = db.resolveTable(target(db, table, name).key + '_xtd', false), master = get(record, name);
    if (master == null) throw new Error('A relative index requires a master key');
    const counter = table.key.replaceAll('.', '_') + '_relidx';
    const rows = await behaviorRows(db, extension, {where: '$main_id=:master', sqlparams: {master}});
    if (rows.length > 1) throw new Error('A relative index requires one extension record per master');
    let value;
    if (rows.length) {
        const old = {...rows[0]}; value = (old[counter] || 0) + 1;
        await db.table(extension.key).update({...old, [counter]: value}, {old_record: old, ignore_partition: true});
    } else {
        value = 1;
        if (!['id', 'main_id'].includes(extension.a.pkey)) throw new Error('Relative-index extension requires id or main_id as its primary key');
        await db.table(extension.key).insert({main_id: master, [extension.a.pkey]: master, [counter]: value}, {ignore_partition: true});
    }
    record[field] = value;
}
async function insertLinked(db, table, record, field) {
    const linked = target(db, table, field), key = get(record, table.a.pkey);
    if (key == null) { delete record[field]; return; }
    const values = {[`${table.a.name}_${table.a.pkey}`]: key, id: String(key).trimEnd().padEnd(22, '_')};
    for (const name of tracked(linked)) if (name !== 'pkey' && Object.hasOwn(record, name)) values[name] = record[name];
    await db.table(linked.key).insert(values);
    record[field] = values.id;
}
async function updateLinked(db, table, record, field, old = {}) {
    const linked = target(db, table, field);
    if (Object.hasOwn(record, field) && record[field] !== get(old, field)) throw new Error('Linked hierarchy roots are unmodifiable');
    const values = Object.fromEntries(tracked(linked).filter(n => n !== 'pkey' && Object.hasOwn(record, n) && changed([n], record, old)).map(n => [n, record[n]]));
    const root = Object.hasOwn(record, field) ? record[field] : get(old, field);
    if (Object.keys(values).length && root != null) {
        const previous = (await behaviorRows(db, linked, {where: `$${linked.a.pkey}=:root`, sqlparams: {root}}))[0];
        await db.table(linked.key).update({...previous, ...values}, {old_record: previous});
    }
}
export async function behaviorTrigger(db, table, trigger, record, field, old) {
    switch (trigger) {
    case 'hierarchical_before': await hierarchyBefore(db, table, record, old); break;
    case 'hierarchical_after': await hierarchyAfter(db, table, record, old); break;
    case 'setRowCounter':
        if (get(record, field) == null) record[field] = await nextCounter(db, table, field, behavior(table, 'counter')?.scope, record);
        break;
    case 'setRelidx': await relativeIndex(db, table, record, field); break;
    case 'insertLinkedHierarchicalRoot': await insertLinked(db, table, record, field); break;
    case 'updateLinkedHierarchicalRoot': await updateLinked(db, table, record, field, old); break;
    default: return false;
    }
    return true;
}
export async function finishBehaviors(db, table, record, prepared, old = null) {
    const spec = behavior(table, 'hierarchical');
    if (spec && !equal(record, prepared)) {
        const moved = changed([spec.parent ?? 'parent_id'], record, prepared);
        if (moved && old == null && behavior(table, 'counter')) record[behavior(table, 'counter').field ?? '_row_count'] = null;
        await hierarchyBefore(db, table, record, old, moved);
    }
    for (const [name, col] of table.columns) if (col.a.onUpdating === 'updateLinkedHierarchicalRoot')
        await updateLinked(db, table, record, name, {...old, ...prepared});
}
export async function completeLinkedInsert(db, table, record, before, options) {
    for (const [name, col] of table.columns) if (col.a.onInserting === 'insertLinkedHierarchicalRoot') {
        if (get(record, name) != null) { await updateLinked(db, table, record, name, before); continue; }
        await insertLinked(db, table, record, name);
        if (get(record, name) == null) throw new Error('The database did not return the linked hierarchy master key');
        await db._executeCompiled(compileWrite(table, 'update', {[table.a.pkey]: record[table.a.pkey], [name]: record[name]},
            {environment: db.environment(), ignore_partition: options.ignore_partition ?? false}));
    }
}

async function lockTable(db, table) {
    const key = table.mapColumns(keyColumns(table))[0];
    await db._executeCompiled({sql: `UPDATE ${quote(table.sqlschema)}.${quote(table.sqlname)} SET ${quote(key)}=${quote(key)} WHERE 0`, params: {}});
}
export async function lockBehaviors(db, table) {
    const tables = new Map();
    if (behavior(table, 'hierarchical') || behavior(table, 'counter')) tables.set(table.key, table);
    const relative = behavior(table, 'relidx');
    if (relative) {
        const extension = db.resolveTable(target(db, table, relative.relation.replace(/^@+/, '')).key + '_xtd', false);
        tables.set(extension.key, extension);
    }
    for (const [name, col] of table.columns) if (col.a.onInserting === 'insertLinkedHierarchicalRoot') {
        const linked = target(db, table, name); tables.set(linked.key, linked);
    }
    for (const name of [...tables.keys()].sort()) await lockTable(db, tables.get(name));
}
