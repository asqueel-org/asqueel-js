import {defineModel} from '../src/index.js';
import {migrateSQLite} from '../src/sqlite.js';
import {applicationHooks, applicationHookHandlers} from '../examples/application-hooks.js';

export const hooksModel = defineModel(applicationHooks);

/** Same input script as Python, with independently implemented JS callbacks. */
export async function runHookCase(adapter, input, {model = hooksModel, handlers = applicationHookHandlers, tables = ['note', 'audit', 'plain', 'simple']} = {}) {
    await migrateSQLite(adapter, model.toMigration());
    const events = [], statements = [], results = [], refs = {};
    let environment = input.setup_environment ?? {user: 'ada'}, ticks = 0, ids = 0;
    const tracing = {
        execute: (...args) => adapter.execute(...args),
        query: async (sql, params = {}) => {
            if (/^(INSERT|UPDATE|DELETE)\b/.test(sql)) statements.push({sql,
                params: Object.fromEntries(Object.entries(params).map(([key, value]) => [key.replace(/^:/, ''), value]))});
            return adapter.query(sql, params);
        },
    };
    const db = model.queries(tracing, {environment: () => environment,
        clock: () => new Date(Date.UTC(2026, 0, 2, 3, 4, 5) + ticks++),
        uuid: () => 'Z' + String(++ids).padStart(21, '0'),
        hooks: input.hooks === false ? {} : handlers(events)});
    async function steps(tx, items) {
        for (const step of items) {
            let values = structuredClone(step.values_from ? refs[step.values_from] : step.values ?? {});
            if (values && typeof values === 'object') Object.assign(values, step.changes ?? {});
            if (step.key_from) values = refs[step.key_from].id;
            const old = structuredClone(step.old_from ? refs[step.old_from] : step.old_record ?? null);
            const options = Object.fromEntries(['pkey', 'ignore_partition'].filter(k => Object.hasOwn(step, k)).map(k => [k, step[k]]));
            if (step.op === 'update') options.old_record = old;
            let result;
            try { result = await tx.table(step.table ?? 'app.note')[step.op](values, options); }
            catch (error) {
                results.push(structuredClone({record: values, old, failed: true}));
                if (step.catch) continue;
                throw error;
            }
            results.push(structuredClone({record: values, old, result: result ?? null}));
            if (step.save) refs[step.save] = structuredClone(result);
        }
    }
    if (input.setup?.length) await db.transaction(tx => steps(tx, input.setup));
    events.length = statements.length = results.length = 0;
    environment = input.environment ?? {user: 'ada'};
    let failed = false;
    try { await db.transaction(tx => steps(tx, input.steps)); }
    catch (error) {
        failed = true;
        if (!input.fails) throw new Error(`${input.name}: ${error.message}`, {cause: error});
        if (input.error && !error.message.includes(input.error)) throw error;
    }
    if (failed !== (input.fails ?? false)) throw new Error(`${input.name}: unexpected outcome`);
    const rows = {};
    for (const name of tables) rows[name] = await adapter.query(`SELECT * FROM "${name}" ORDER BY id`);
    return {failed, results, events, statements, rows};
}
