import {defineModel} from '../src/index.js';
import {browserQueries} from '../examples/browser-queries.js';
import {queryFeatures} from '../examples/query-features.js';
import {readFormulas} from '../examples/read-formulas.js';
import reads from '../test/fixtures/reads.json' with {type: 'json'};
import {subqueries} from '../examples/subqueries.js';
import subqueryOracle from '../test/fixtures/subqueries.json' with {type: 'json'};
import base from '../test/fixtures/queries.json' with {type: 'json'};
import features from '../test/fixtures/query-features.json' with {type: 'json'};
import {nativeSQLite} from '../test/native-sqlite.js';
import {migrateSQLite} from '../src/sqlite.js';
const result = {};
for (const [name, recipe, oracle] of [['base', browserQueries, base], ['features', queryFeatures, features], ['reads', readFormulas, reads], ['subqueries', subqueries, subqueryOracle]]) {
    const model = defineModel(recipe), db = nativeSQLite();
    try {
        if (oracle.ddl) { for (const sql of oracle.ddl) await db.execute(sql); }
        else await migrateSQLite(db, model.toMigration());
        const compiled = model.queries(db), cases = [];
        for (const {name, request} of oracle.cases) cases.push({name, request,
            compiled: compiled.compile(request), rows: await compiled.execute(request)});
        result[name] = {model: model.toJSON(), desired: model.toMigration(), cases, ...(oracle.ddl ? {ddl: oracle.ddl} : {})};
        if (oracle.errors) result[name].errors = oracle.errors.map(({name, request}) => {
            let rejected = false;
            try { compiled.compile(request); } catch { rejected = true; }
            return {name, request, rejected};
        });
    } finally { await db.close(); }
}
process.stdout.write(JSON.stringify(result));
