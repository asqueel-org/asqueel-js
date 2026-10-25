import inputs from '../test/model-inputs.json' with {type:'json'};
import cases from '../test/fixtures/model-cases.json' with {type:'json'};
import examples from '../test/fixtures/model-examples.json' with {type:'json'};
import {evaluateModel} from '../test/model-cases.js';
import {equal, migrateSQLite} from '../src/sqlite.js';
import {sourceRows} from '../src/source-bag.js';
import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {SqlBuilder, defineModel} from '../src/index.js';
import {querySource, modelFromQuerySource} from '../src/queries.js';
import {groupedItems} from '../examples/groups.js';
import {virtualRelations} from '../examples/virtual-relations.js';

async function virtualRelationPersistenceCheck() {
    const model = modelFromQuerySource(querySource(defineModel(virtualRelations)), SqlBuilder);
    const expected = examples['virtual-relations'];
    if (!equal(sourceRows(model.toTytx()), sourceRows(expected.source)) || !equal(model.toMigration(), expected.migration)) {
        throw new Error('VirtualRelation: model or migration differs from Python after serialization');
    }
    const id = `asqueel-virtual-relations-test-${crypto.randomUUID()}`;
    let db = await openBrowserSQLite(id);
    try {
        await migrateSQLite(db, model.toMigration());
        const queries = model.queries(db);
        await queries.execute({operation: 'insert', table: 'app.customer', values: {id: 1, name: 'Ada'}});
        await queries.execute({operation: 'insert', table: 'app.item', values: {id: 2, name: 'Locale', customer_id: 1}});
        const foreignKeys = await db.query('PRAGMA foreign_key_list(app_item)');
        if (foreignKeys.length !== 1 || foreignKeys[0].table !== 'app_customer') throw new Error('VirtualRelation changed the physical foreign keys');
        let rejected = false;
        try { await queries.execute({operation: 'insert', table: 'app.item', values: {id: 3, customer_id: 999}}); }
        catch { rejected = true; }
        if (!rejected) throw new Error('The physical foreign key is not enforced');
        await db.close();
        db = await openBrowserSQLite(id);
        const rows = await model.queries(db).execute({operation: 'select', table: 'app.item', columns: '$id,@customer_id.name AS customer'});
        if (!equal(rows, [{id: 2, customer: 'Ada'}])) throw new Error('VirtualRelation: data or physical relation lost');
        if ((await migrateSQLite(db, model.toMigration())).executed.length) throw new Error('VirtualRelation: migration not idempotent');
        return 'VirtualRelation: Python model, real migration without virtual foreign keys, physical constraints and IndexedDB persistence';
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('virtualRelation database cleanup blocked'));
        });
    }
}

async function groupedPersistenceCheck() {
    const original = defineModel(groupedItems);
    const model = modelFromQuerySource(querySource(original), SqlBuilder);
    const expected = examples.groups;
    // The worker replay keeps the declarations; the authored source is the one compared with Python.
    if (!equal(sourceRows(original.toTytx()), sourceRows(expected.source)) || !equal(model.toSource(), original.toSource())
        || !equal(model.toMigration(), expected.migration)) {
        throw new Error('Column groups/formulas: serialization differs from the Python model');
    }
    const id = `asqueel-groups-test-${crypto.randomUUID()}`;
    let db = await openBrowserSQLite(id);
    try {
        await migrateSQLite(db, model.toMigration());
        await model.queries(db).execute({operation: 'insert', table: 'app.item', values: {id: 1, name: 'Locale', city: 'Roma'}});
        await db.close();
        db = await openBrowserSQLite(id);
        const rows = await model.queries(db).execute({operation: 'select', table: 'app.item', columns: '$id,$name,$city'});
        if (!equal(rows, [{id: 1, name: 'Locale', city: 'Roma'}])) throw new Error('Column groups/formulas: data not persisted');
        if ((await migrateSQLite(db, model.toMigration())).executed.length) throw new Error('Column groups/formulas: migration not idempotent');
        return 'Column groups and formulas: Python model, real migration, INSERT/SELECT and IndexedDB persistence';
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Column group database cleanup blocked'));
        });
    }
}

export async function compositionChecks() {
    const passed = [];
    for (const [i,entry] of cases.entries()) {
        const comparable = result => result.source === undefined ? result : {...result, source: sourceRows(result.source)};
        if (!equal(comparable(evaluateModel(inputs[i])), comparable(entry.expected))) throw new Error(`Composition differs from Python: ${entry.name}`);
        passed.push(`Composed TYTX source and migration identical to Python: ${entry.name}`);
    }
    const desired = evaluateModel(inputs.find(c => c.name === 'several_layers_preserve_order')).migration;
    const id = `asqueel-composition-test-${crypto.randomUUID()}`;
    let db = await openBrowserSQLite(id);
    try {
        await migrateSQLite(db, desired);
        await db.execute('INSERT INTO app_item (id, name, second, third) VALUES (?, ?, ?, ?)', [1, 'Composed', 2, 3]);
        await db.close();
        db = await openBrowserSQLite(id);
        if (!equal(await db.query('SELECT id, name, second, third FROM app_item'), [{id: 1, name: 'Composed', second: 2, third: 3}])) {
            throw new Error('Data of the composed model not persisted');
        }
        if ((await migrateSQLite(db, desired)).executed.length) throw new Error('Composed migration not idempotent');
        passed.push('Composed model migrated on WASM/IndexedDB: data persisted and empty diff after reopen');
        passed.push(await groupedPersistenceCheck());
        passed.push(await virtualRelationPersistenceCheck());
        return passed;
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Composition database cleanup blocked'));
        });
    }
}
