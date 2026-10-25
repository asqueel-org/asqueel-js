// SQLite application write cycle, ported from Python db_write/table_crud/table_triggers.
import {own, record as requireRecord} from './sql-expressions.js';
import {compileWrite, keyColumns, keyValues, partition, guardPartition} from './write-compiler.js';
import {behavior, lockBehaviors, behaviorTrigger, finishBehaviors, completeLinkedInsert} from './table-behaviors.js';
import {checkRelatedCapabilities, deleteRelated, archiveRelated, updateRelated} from './related-writes.js';
import {RecordNotFoundError, UnsupportedFeatureError} from './query-errors.js';

const events = ['onInserting', 'onInserted', 'onUpdating', 'onUpdated', 'onDeleting', 'onDeleted'];
const enabled = (table, name) => table.options.has(name) && table.options.get(name).spec.enabled !== false;
// checkPkey generates the sysFields key.
const sysKey = (table, name) => name === 'id' && table.a.pkey === 'id' && enabled(table, 'sysFields')
    && table.options.get('sysFields').spec.id !== false;

export function legacy22(milliseconds = Date.now(), bytes = crypto.getRandomValues(new Uint8Array(9))) {
    const encode = (value, length) => {
        let result = '';
        for (let i = 0; i < length; i++, value /= 62n) result = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'[Number(value % 62n)] + result;
        return result;
    };
    const random = bytes.reduce((v, b) => v * 256n + BigInt(b), 0n);
    return 'Z' + encode(BigInt(milliseconds) * 1000n - 1735689600000000n, 9) + encode(random, 12);
}

// Portable timestamp strings retain the SQLite/Python representation. JS clocks
// have millisecond precision; providers can return a preformatted value for finer clocks.
function timestamp(value, utc) {
    if (typeof value === 'string') {
        if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:\+00:00)?$/.test(value))
            throw new TypeError('clock: usare Date o un timestamp SQLite');
        if (utc !== value.endsWith('+00:00')) throw new TypeError('clock: timezone non coerente con il campo');
        return value;
    }
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new TypeError('clock deve restituire una data valida');
    const pad = (n, digits = 2) => String(n).padStart(digits, '0');
    const get = part => value[`get${utc ? 'UTC' : ''}${part}`]();
    const micro = get('Milliseconds') ? '.' + pad(get('Milliseconds'), 3) + '000' : '';
    return `${pad(get('FullYear'), 4)}-${pad(get('Month') + 1)}-${pad(get('Date'))}T${pad(get('Hours'))}:${pad(get('Minutes'))}:${pad(get('Seconds'))}${micro}${utc ? '+00:00' : ''}`;
}

function capabilities(db, table, operation) {
    for (const [name] of table.options) if (enabled(table, name) && !['sysFields', 'hierarchical', 'counter', 'relidx'].includes(name))
        throw new UnsupportedFeatureError(`${table.key}: option ${name} non ancora eseguita in JS`);
    for (const [name, col] of table.columns) {
        if (col.children.some(n => n.tag !== 'relation') || col.a.default_from != null)
            throw new UnsupportedFeatureError(`${table.key}.${name}: comportamento non ancora eseguito`);
        for (const event of events) if (col.a[event] && typeof col.a[event] !== 'string')
            throw new UnsupportedFeatureError('I trigger di campo devono essere nomi registrati nel runtime');
    }
    checkRelatedCapabilities(db, table, operation);
}

function checkChanges(table, values, old = null) {
    for (const [name, col] of table.columns) {
        if (!own(values, name)) continue;
        if (old == null) {
            if (col.a.readOnly && !sysKey(table, name)) throw new Error(`${table.key}.${name} is read-only`);
        } else if (col.a.readOnly || col.a.unmodifiable || own(col.a, 'sql_generatedExpression')) {
            let value = values[name], previous = old[name] ?? null;
            if (col.a.dtype === 'A' && typeof value === 'string' && typeof previous === 'string') {
                value = value.trimEnd(); previous = previous.trimEnd();
            }
            const sameBoolean = ['boolean', 'number'].includes(typeof value) && ['boolean', 'number'].includes(typeof previous)
                && Number(value) === Number(previous);
            if (value !== previous && !sameBoolean)
                throw new Error(`${table.key}.${name} is unmodifiable`);
        }
    }
}

function recordKey(table, values) {
    if (own(values, table.a.pkey)) return values[table.a.pkey];
    const keys = keyColumns(table);
    for (const key of keys) if (!own(values, key)) throw new Error(`Chiave mancante: ${key}`);
    return keys.length === 1 ? values[keys[0]] : JSON.stringify(keys.map(k => values[k]));
}

async function reread(db, table, pkey) {
    const keys = keyColumns(table), values = keyValues(table, pkey);
    const rows = await db.table(table.key).query({columns: [...table.columns.keys()].map(k => '$' + k).join(','),
        where: keys.map((k, i) => `$${k}=:key${i}`).join(' AND '), sqlparams: Object.fromEntries(values.map((v, i) => [`key${i}`, v])),
        exclude_draft: false, exclude_logical_deleted: false, ignore_partition: true, order_by: ''}).fetch();
    const row = rows[0] ?? null;
    if (row) for (const [name, column] of table.columns) if (column.a.dtype === 'B' && row[name] != null) row[name] = Boolean(row[name]);
    return row;
}

function hookContext(db, table) {
    return Object.assign(Object.create(null), db.runtime.hooks?.[table.key] ?? {}, {
        db, fullname: table.key, currentUser: db.environment().user ?? null,
        currentTrigger: db.scope.trigger, model: db.model.table(table.key),
    });
}
async function hook(context, name, values, kwargs = {}, required = false) {
    const fn = context[name];
    if (fn == null && !required) return;
    if (typeof fn !== 'function') throw new UnsupportedFeatureError(`${context.fullname}.${name}: hook non registrato`);
    return await fn.call(context, values, kwargs);
}
async function fieldTriggers(db, table, event, values, kwargs = {}) {
    for (const [name, column] of table.columns) {
        const trigger = column.a[event];
        if (!trigger) continue;
        const target = column.a.trigger_table ? db.resolveTable(column.a.trigger_table, false) : table;
        const context = hookContext(db, target), method = `trigger_${trigger}`;
        if (context[method]) await hook(context, method, values, {...kwargs, fldname: name, tblname: table.key}, true);
        else if (trigger === 'setTSNow') {
            const dtype = target.columns.get(name)?.a.dtype;
            if (!dtype) throw new Error(`Campo timestamp non trovato: ${target.key}.${name}`);
            values[name] = timestamp((db.runtime.clock ?? (() => new Date()))({table: target.key, field: name, dtype}), dtype === 'DHZ');
        } else if (trigger === 'setCurrentUser') values[name] = db.environment().user ?? null;
        else if (!await behaviorTrigger(db, target, trigger, values, name, kwargs.old_record))
            await hook(context, method, values, {...kwargs, fldname: name, tblname: table.key}, true);
    }
}

async function checkPkey(db, table, values, context) {
    const pkey = table.a.pkey;
    if (values[pkey] != null && values[pkey] !== '') return;
    const col = table.columns.get(pkey);
    if (col && (own(col.a, 'sql_default') || ['serial', 'serial4'].includes(col.a.dtype))) return;
    let value;
    if (context.newPkeyValue) value = await hook(context, 'newPkeyValue', values);
    else if (keyColumns(table).length > 1) value = recordKey(table, Object.fromEntries(Object.entries(values).filter(([k]) => k !== pkey)));
    else if (['I', 'L', 'R'].includes(col.a.dtype)) {
        const rows = await db.table(table.key).query({columns: `max($${pkey}) AS last`}).fetch();
        value = (rows[0].last || 0) + 1;
    } else if (!Object.keys(values).length) value = (db.runtime.uuid ?? legacy22)();
    else if (table.a.pkey_columns) value = table.a.pkey_columns.split(',').map(n => values[n.trim()]).filter(v => v != null)
        .map(v => typeof v === 'boolean' ? v ? 'True' : 'False' : String(v)).join(table.a.pkey_columns_joiner || '_');
    else if (values.__syscode) value = col.a.size && !col.a.size.includes(':') ? values.__syscode.padEnd(Number(col.a.size), '_') : values.__syscode;
    else if (['T', 'A', 'C'].includes(col.a.dtype) && ['22', ':22', undefined, null].includes(col.a.size)) value = (db.runtime.uuid ?? legacy22)();
    if (value != null) values[pkey] = value;
}

/** Run on an operation-local child queue within a reserved write transaction. */
export async function writeRecord(db, table, operation, input, options) {
    capabilities(db, table, operation);
    let values = input;
    if (operation === 'delete' && (typeof values === 'string' || typeof values === 'number')) {
        await lockBehaviors(db, table);
        values = await reread(db, table, values);
        if (!values) return;
    }
    requireRecord(values);
    const environment = db.environment(), policy = partition(table, environment, options.ignore_partition ?? false);
    let old = options.old_record ?? null;
    db.scope.trigger = {event: operation, table: table.key, record: values, old_record: operation === 'delete' ? structuredClone(values) : old,
        parent: db.scope.trigger ?? null};
    const context = hookContext(db, table);
    await lockBehaviors(db, table);
    if (operation === 'insert') {
        checkChanges(table, values);
        guardPartition(table, values, policy, true);
        for (const [name, col] of table.columns) if (!own(values, name) && col.a.default != null) values[name] = structuredClone(col.a.default);
        await checkPkey(db, table, values, context);
        await hook(context, 'protect_validate', values);
        await fieldTriggers(db, table, 'onInserting', values);
        const prepared = structuredClone(values);
        await hook(context, 'trigger_onInserting', values);
        await hook(context, 'trigger_assignCounters', values);
        if (table.a.draftField && context.protect_draft) values[table.a.draftField] = await hook(context, 'protect_draft', values);
        await finishBehaviors(db, table, values, prepared);
    } else if (operation === 'update') {
        if (behavior(table, 'hierarchical') && !old) throw new Error('Updating a hierarchical record requires old_record');
        if (policy || behavior(table, 'hierarchical') || [...table.columns.values()].some(c => c.a.readOnly || c.a.unmodifiable || own(c.a, 'sql_generatedExpression'))) {
            const stored = await reread(db, table, old ? recordKey(table, old) : options.pkey ?? recordKey(table, values));
            if (!stored) throw new RecordNotFoundError(`${table.key}: no record to update`);
            if (old) Object.assign(old, stored); else old = stored;
        }
        if (old) guardPartition(table, old, policy, false);
        db.scope.trigger.old_record = old;
        const original = structuredClone(old);
        checkChanges(table, values, original);
        await hook(context, 'protect_update', values, {old_record: old});
        await hook(context, 'protect_validate', values, {old_record: old});
        await fieldTriggers(db, table, 'onUpdating', values, {old_record: old});
        const prepared = structuredClone(values);
        await hook(context, 'trigger_onUpdating', values, {old_record: old});
        if (table.a.draftField && context.protect_draft) values[table.a.draftField] = await hook(context, 'protect_draft', values);
        const deletion = table.a.logicalDeletionField;
        if (deletion && old && (values[deletion] ?? null) !== (old[deletion] ?? null))
            await archiveRelated(db, table, values, values[deletion] ?? null);
        await hook(context, 'trigger_assignCounters', values, {old_record: old});
        checkChanges(table, values, original);
        await finishBehaviors(db, table, values, prepared, original);
        options = {...options, old_record: original};
    } else {
        let original = structuredClone(values);
        if (policy) {
            original = await reread(db, table, recordKey(table, values));
            if (!original) throw new RecordNotFoundError(`${table.key}: no record to delete`);
            guardPartition(table, original, policy, false);
        }
        db.scope.trigger.old_record = structuredClone(original);
        if (typeof table.a.deletable === 'string' || table.a.deletable === false) throw new Error(`${table.key}: records cannot be deleted`);
        await hook(context, 'protect_delete', values);
        await fieldTriggers(db, table, 'onDeleting', values);
        await hook(context, 'trigger_onDeleting', values);
        await deleteRelated(db, table, original);
        await db._executeCompiled(compileWrite(table, operation, original, {...options, environment}));
        const count = await db._executeCompiled({sql: 'SELECT changes() AS n', params: {}});
        if (count[0].n !== 1) throw new RecordNotFoundError(`${table.key}: DELETE removed ${count[0].n} rows instead of 1`);
        await fieldTriggers(db, table, 'onDeleted', values);
        await hook(context, 'trigger_onDeleted', values);
        await hook(context, 'trigger_releaseCounters', values);
        return;
    }
    const sqlRecord = operation === 'update' ? Object.fromEntries(Object.entries(values).filter(([name]) => !own(table.columns.get(name)?.a ?? {}, 'sql_generatedExpression'))) : values;
    const beforeSql = structuredClone(values);
    const rows = await db._executeCompiled(compileWrite(table, operation, sqlRecord, {...options, environment}));
    Object.assign(values, rows[0] ?? {});
    if (operation === 'insert') await completeLinkedInsert(db, table, values, beforeSql, options);
    else await updateRelated(db, table, values, old);
    await fieldTriggers(db, table, operation === 'insert' ? 'onInserted' : 'onUpdated', values, operation === 'insert' ? {} : {old_record: old});
    await hook(context, operation === 'insert' ? 'trigger_onInserted' : 'trigger_onUpdated', values, operation === 'insert' ? {} : {old_record: old});
    return values;
}


/** Raw SqlTable._assign_keys: no write triggers, consecutive integer keys within a block. */
export async function assignImportKeys(db, table, records) {
    const pkey = table.a.pkey, column = table.columns.get(pkey);
    if (!pkey || column && (own(column.a, 'sql_default') || ['serial', 'serial4'].includes(column.a.dtype))) return;
    const integer = column && ['L', 'I', 'R'].includes(column.a.dtype);
    let next = null;
    for (const values of records) {
        if (integer && next !== null && (values[pkey] == null || values[pkey] === '')) values[pkey] = next;
        else await checkPkey(db, table, values, hookContext(db, table));
        if (integer && values[pkey] != null) next = Math.max(next || 0, Number(values[pkey]) + 1);
    }
}
