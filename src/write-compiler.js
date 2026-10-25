import {names} from './structures.js';
import {q, record, columnName, tableSQL, own} from './sql-expressions.js';
import {prepareParameters} from './sql-parameters.js';

// Mechanical port of WriteCompiler's SQLite record statements (Python 0.6.1 + #44).
// This layer only compiles; application hooks and transaction ownership are separate.
export function keyColumns(table) {
    if (!table.a.pkey) throw new Error(`${table.key} non ha una chiave primaria`);
    return names(table.composites.get(table.a.pkey)?.a.columns ?? table.a.pkey);
}
export function keyValues(table, pkey) {
    const keys = keyColumns(table);
    if (keys.length === 1 && !table.composites.has(table.a.pkey)) return [pkey];
    if (typeof pkey !== 'string') throw new Error('La chiave composta deve essere una stringa JSON serializzata');
    const values = JSON.parse(pkey);
    if (!Array.isArray(values) || values.length !== keys.length) throw new Error('Numero di componenti della chiave primaria non valido');
    return values.map((value, i) => {
        if (typeof value === 'string' && /::(?:D|DH|DHZ|N|H|HZ)$/.test(value)) throw new Error('Codec temporali/decimali della chiave composta non ancora supportati');
        return table.columns.get(keys[i]).a.dtype === 'B' && typeof value === 'number' ? Boolean(value) : value;
    });
}
function required(data, name) {
    if (!own(data, name)) throw new Error(`Componente della chiave mancante: ${name}`);
    return data[name];
}
export function prepareRecord(table, values, methods = null) {
    // Python virtual_columns: the declared ones plus the formulaColumn_<x>() objects.
    const dynamic = methods ? methods.columns(table) : new Map();
    const data = Object.create(null);
    for (const [name, value] of Object.entries(record(values))) {
        const column = table.columns.get(name);
        if (column && own(column.a, 'sql_generatedExpression')) throw new Error(`Colonna generata non assegnabile: ${table.key}.${name}`);
        if (name.startsWith('@') || name === 'pkey' || table.virtual.has(name) || dynamic.has(name.toLowerCase())
            || table.composites.has(name)) continue;
        data[name] = value;
    }
    for (const [name, column] of table.columns) if (own(column.a, 'sql_value') && !own(data, name)) data[name] = null;
    return data;
}
export function partition(table, snapshot, ignore) {
    if (typeof ignore !== 'boolean') throw new Error('ignore_partition deve essere booleano');
    if (ignore) return null;
    const attribute = Object.keys(table.a).find(k => k.startsWith('partition_'));
    if (!attribute) return null;
    const field = attribute.slice(10), path = table.a[attribute];
    const current = snapshot[`current_${path}`], allowed = snapshot[`allowed_${path}`];
    if (current == null && allowed == null) return null;
    if (!table.columns.has(field)) throw new Error('La partizione di scrittura richiede una colonna fisica');
    return {field, current, allowed};
}
export function guardPartition(table, data, policy, insert) {
    if (!policy) return;
    const {field, current, allowed} = policy;
    if (insert && !own(data, field) && current != null) data[field] = current;
    if (insert && !own(data, field)) throw new Error(`La scrittura richiede la partizione ${field}`);
    if (!own(data, field)) return;
    const normalize = value => ['A', 'C'].includes(table.columns.get(field).a.dtype) && typeof value === 'string' ? value.trimEnd() : value;
    const valid = current != null ? normalize(data[field]) === normalize(current)
        : Array.isArray(allowed) && allowed.length && (data[field] == null || allowed.map(normalize).includes(normalize(data[field])));
    if (!valid) throw new Error(`${table.key}.${field}: valore fuori dalla partizione attiva`);
}
function predicate(table, values, params, policy) {
    let where = keyColumns(table).map((name, i) => {
        params[`__pkey__${i}`] = values[i];
        return `${q(columnName(table.columns.get(name)))}=:__pkey__${i}`;
    }).join(' AND ');
    if (policy) {
        const field = q(columnName(table.columns.get(policy.field)));
        let i = 0;
        while (own(params, `__partition_${i}`)) i++;
        const key = `__partition_${i}`;
        let filter = '1=0';
        if (policy.current != null) { params[key] = policy.current; filter = `${field} = :${key}`; }
        else if (policy.allowed?.length) { params[key] = policy.allowed; filter = `(${field} IS NULL OR ${field} IN :${key})`; }
        where = `(${where}) AND (${filter})`;
    }
    return where;
}
function binding(name, data) {
    if (/^[A-Za-z_]\w*$/u.test(name)) return `:${name}`;
    let parameter = `__write_${Object.keys(data).length}`;
    while (own(data, parameter)) parameter += '_';
    data[parameter] = data[name];
    return `:${parameter}`;
}
function returning(table, data, insert) {
    const selected = [...table.columns].filter(([name, {a}]) => a.sql_value != null || own(a, 'sql_generatedExpression')
        || insert && data[name] == null && (own(a, 'sql_default') || ['serial', 'serial4'].includes(a.dtype)));
    return selected.length ? ' RETURNING ' + selected.map(([name, column]) => `${q(columnName(column))} AS ${q(name)}`).join(',') : '';
}
export function compileWrite(table, operation, values, {pkey, old_record, environment = {}, ignore_partition = false, returningRows = true, methods = null} = {}) {
    const policy = partition(table, environment, ignore_partition);
    const data = operation === 'delete' ? Object.create(null) : prepareRecord(table, values, methods);
    let sql;
    if (operation === 'insert') {
        guardPartition(table, data, policy, true);
        const entries = Object.entries(data).filter(([name, value]) => table.columns.has(name) && (value != null || table.columns.get(name).a.sql_value != null));
        const columns = entries.map(([name]) => q(columnName(table.columns.get(name))));
        const parameters = entries.map(([name]) => table.columns.get(name).a.sql_value ? table.columns.get(name).a.sql_value + '\n' : binding(name, data));
        sql = `INSERT INTO ${tableSQL(table)}` + (entries.length ? `(${columns.join(',')}) VALUES (${parameters.join(',')})` : ' DEFAULT VALUES');
        if (returningRows) sql += returning(table, data, true);
    } else if (operation === 'update') {
        guardPartition(table, data, policy, false);
        const assignments = Object.keys(data).filter(name => table.columns.has(name)).map(name => {
            const column = table.columns.get(name);
            return `${q(columnName(column))}=` + (column.a.sql_value ? column.a.sql_value + '\n' : binding(name, data));
        });
        if (!assignments.length) throw new Error('UPDATE richiede almeno una colonna');
        const keys = old_record && Object.keys(old_record).length ? keyColumns(table).map(n => required(old_record, n))
            : pkey != null ? keyValues(table, pkey) : keyColumns(table).map(n => required(data, n));
        sql = `UPDATE ${tableSQL(table)} SET ${assignments.join(',')} WHERE ${predicate(table, keys, data, policy)}` + returning(table, data, false);
    } else if (operation === 'delete') {
        sql = `DELETE FROM ${tableSQL(table)} WHERE ${predicate(table, keyColumns(table).map(n => required(record(values), n)), data, policy)}`;
    } else throw new Error(`Scrittura sconosciuta: ${operation}`);
    return prepareParameters(sql, data, environment);
}
