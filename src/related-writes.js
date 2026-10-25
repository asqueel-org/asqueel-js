// Physical incoming relations: application update/delete cascades and archiving.
import {behaviorRows} from './table-behaviors.js';
import {keyColumns} from './write-compiler.js';
import {UnsupportedFeatureError} from './query-errors.js';

function referenceValue(record, field) {
    if (!Object.hasOwn(record, field)) throw new Error(`Missing relation field '${field}'`);
    return record[field];
}
function incoming(db, table) {
    return [...db.model.table(table.key).relations.entries().values()]
        .map(n => n.attributes.joiner).filter(j => j?.mode === 'M');
}
export function checkRelatedCapabilities(db, table, operation) {
    if (operation === 'insert') return;
    for (const j of incoming(db, table)) {
        const declared = j[operation === 'delete' ? 'onDelete' : 'onUpdate']?.toLowerCase();
        const action = operation === 'delete' ? declared?.split(':')[0] : declared;
        const archiving = operation === 'update' && table.a.logicalDeletionField && j.onDelete?.toLowerCase() === 'cascade';
        if (!archiving && (!action || action === 'ignore')) continue;
        const [pkg, name, field] = j.many_relation.split('.'), other = db.resolveTable(`${pkg}.${name}`, false);
        if (!other.columns.has(field) || !table.columns.has(j.one_relation.split('.')[2]) ||
            (operation === 'update' && action && !['ignore', 'raise', 'cascade'].includes(action)) ||
            (operation === 'delete' && !['ignore', 'raise', 'cascade', 'setnull'].includes(action)))
            throw new UnsupportedFeatureError('Azioni applicative della relazione non ancora eseguite');
    }
}
export async function deleteRelated(db, table, record) {
    for (const j of incoming(db, table)) {
        const [action, ...message] = (j.onDelete || 'ignore').split(':'), mode = action.toLowerCase();
        if (mode === 'ignore') continue;
        const [pkg, name, field] = j.many_relation.split('.'), related = db.resolveTable(`${pkg}.${name}`, false);
        const rows = await behaviorRows(db, related, {where: `$${field} = :pid`, sqlparams: {pid: referenceValue(record, j.one_relation.split('.')[2])}});
        const remaining = rows.filter(row => {
            for (let trigger = db.currentTrigger; trigger; trigger = trigger.parent) {
                const original = trigger.old_record ?? trigger.record;
                if (trigger.event === 'delete' && trigger.table === related.key && original &&
                    keyColumns(related).every(k => (original[k] ?? null) === (row[k] ?? null))) return false;
            }
            return true;
        });
        if (remaining.length && mode === 'raise') throw new Error(message.join(':') || `Record referenced in table ${related.key}`);
        for (const row of remaining) {
            if (mode === 'cascade') {
                // Earlier cascades may have removed a sibling/subtree already.
                const keys = keyColumns(related);
                const exists = await behaviorRows(db, related, {where: keys.map((k, i) => `$${k}=:key${i}`).join(' AND '),
                    sqlparams: Object.fromEntries(keys.map((k, i) => [`key${i}`, row[k]]))});
                if (exists.length) await db.table(related.key).delete(row, {ignore_partition: true});
            } else if (mode === 'setnull') await db.table(related.key).update({...row, [field]: null}, {old_record: row, ignore_partition: true});
        }
    }
}
export async function archiveRelated(db, table, record, timestamp) {
    for (const j of incoming(db, table)) {
        if ((j.onDelete || 'raise').split(':')[0].toLowerCase() !== 'cascade') continue;
        const [pkg, name, field] = j.many_relation.split('.'), related = db.resolveTable(`${pkg}.${name}`, false);
        const deletion = related.a.logicalDeletionField;
        if (!deletion) continue;
        // Python's query.update keeps partition filtering and the table's default ordering.
        const rows = await behaviorRows(db, related, {where: `$${field} = :pid`,
            sqlparams: {pid: referenceValue(record, j.one_relation.split('.')[2])}, ignore_partition: false, order_by: undefined});
        for (const old of rows) await db.table(related.key).update({...old, [deletion]: timestamp}, {old_record: old});
    }
}

/** Python CrudMixin.updateRelated runs after the parent's SQL, before after-hooks. */
export async function updateRelated(db, table, record, oldRecord) {
    for (const j of incoming(db, table)) {
        const action = (j.onUpdate || '').toLowerCase();
        if (!action || action === 'ignore') continue;
        if (oldRecord == null) throw new Error(`${table.key}: onUpdate of ${j.many_relation} requires old_record`);
        const field = j.one_relation.split('.')[2];
        const value = record[field] ?? null, previous = oldRecord[field] ?? null;
        const numeric = v => typeof v === 'number' || typeof v === 'boolean';
        if (value === previous || numeric(value) && numeric(previous) && Number(value) === Number(previous)) continue;
        const [pkg, name, foreignField] = j.many_relation.split('.');
        const related = db.resolveTable(`${pkg}.${name}`, false);
        const rows = await behaviorRows(db, related, {where: `$${foreignField} = :pid`,
            sqlparams: {pid: referenceValue(oldRecord, field)}});
        if (!rows.length) continue;
        if (action === 'raise') throw new Error(`Record referenced in table ${related.key}`);
        for (const old of rows) {
            // Selection ignores partitions, but each write enforces the active one,
            // exactly like Python. Nested hooks/cascades share the parent's transaction.
            await db.table(related.key).update({...old, [foreignField]: referenceValue(record, field)}, {old_record: old});
        }
    }
}
