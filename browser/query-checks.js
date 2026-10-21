import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {defineModel} from '../src/index.js';
import {browserQueries} from '../examples/browser-queries.js';
import {equal, migrateSQLite} from '../src/sqlite.js';
import oracle from '../test/fixtures/queries.json' with {type: 'json'};
import featureOracle from '../test/fixtures/query-features.json' with {type: 'json'};
import {queryFeatures} from '../examples/query-features.js';
import {queryRuntimeChecks} from '../test/query-runtime-checks.js';
import {readChecks} from './read-checks.js';
import {callbackChecks} from './callback-checks.js';
import {subqueryChecks} from './subquery-checks.js';

export async function queryChecks() {
    const id = `asqueel-query-test-${crypto.randomUUID()}`, checks = [];
    let db = await openBrowserSQLite(id);
    const model = defineModel(browserQueries);
    try {
        if (!equal(model.toJSON(), oracle.model) || !equal(model.toMigration(), oracle.desired)) throw new Error('Modello query diverso da Python');
        await migrateSQLite(db, model.toMigration());
        checks.push('Modello query identico a Python, quattro tabelle migrate');
        let compiler = model.queries(db);
        for (const c of oracle.cases) {
            if (!equal(compiler.compile(c.request), c.compiled)) throw new Error(`SQL/parametri diversi: ${c.name}`);
            const rows = await compiler.execute(c.request);
            if (!equal(rows, c.rows)) throw new Error(`Risultati diversi: ${c.name}`);
        }
        checks.push(`${oracle.cases.length} query: SQL e parametri esattamente identici a Python`);
        checks.push(`${oracle.cases.length} esecuzioni SQLite: risultati identici a Python`);
        const people = compiler.table('notes.person');
        let duplicate = false;
        try { await people.insert({id: 101, name: 'duplicato'}); } catch { duplicate = true; }
        if (!duplicate) throw new Error('INSERT duplicato non rifiutato');
        const before = await people.query({columns: '*', order_by: '$id'}).fetch();
        if (!equal(before, oracle.cases.find(c => c.name === 'people').rows)) throw new Error('Rollback INSERT fallito');
        checks.push('INSERT duplicato rifiutato; rollback senza alterare i record');
        await queryRuntimeChecks(compiler);
        checks.push('CRUD, record/count/exists, transazioni atomiche e rollback verificati su WASM');
        const featureModel = defineModel(queryFeatures);
        if (!equal(featureModel.toJSON(), featureOracle.model) || !equal(featureModel.toMigration(), featureOracle.desired)) throw new Error('Modello feature diverso da Python');
        for (const sql of featureOracle.ddl) await db.execute(sql);
        for (const c of featureOracle.cases) {
            if (!equal(featureModel.queries().compile(c.request), c.compiled)) throw new Error(`SQL/parametri feature diversi: ${c.name}`);
            if (!equal(await featureModel.queries(db).execute(c.request), c.rows)) throw new Error(`Risultati feature diversi: ${c.name}`);
        }
        checks.push(`${featureOracle.cases.length} casi aggiuntivi Python: formule, default, colonne generate, partizioni e chiavi composte`);
        await db.close();
        db = await openBrowserSQLite(id);
        compiler = model.queries(db);
        const related = oracle.cases.find(c => c.name === 'related_notes');
        if (!equal(await compiler.execute(related.request), related.rows)) throw new Error('Rilettura dopo riapertura fallita');
        checks.push('Riapertura IndexedDB: SELECT con relazione restituisce gli stessi dati');
        checks.push(...await readChecks());
        checks.push(...await subqueryChecks());
        checks.push(...await callbackChecks());
        return checks;
    } finally {
        await db.close();
        await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(id);
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Pulizia database query bloccata'));
        });
    }
}
