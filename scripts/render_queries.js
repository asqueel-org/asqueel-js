import {queryPeriods} from '../examples/query-periods.js';
import periodOracle from '../test/fixtures/periods.json' with {type: 'json'};
import {queryMacros} from '../examples/query-macros.js';
import macroOracle from '../test/fixtures/macros.json' with {type: 'json'};
import {compilerCallbacks, compilerMethods, callbackCacheProbe} from '../examples/compiler-callbacks.js';
import callbackOracle from '../test/fixtures/callbacks.json' with {type: 'json'};
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
for (const [name, recipe, oracle] of [['base', browserQueries, base], ['features', queryFeatures, features], ['reads', readFormulas, reads], ['subqueries', subqueries, subqueryOracle], ['callbacks', compilerCallbacks, callbackOracle], ['macros', queryMacros, macroOracle], ['periods', queryPeriods, periodOracle]]) {
    const model = defineModel(recipe), db = nativeSQLite();
    try {
        if (oracle.ddl) { for (const sql of oracle.ddl) await db.execute(sql); }
        else await migrateSQLite(db, model.toMigration());
        const events = [], compiled = model.queries(db, name === 'callbacks' ? {methods: compilerMethods(events)} : {}), cases = [];
        for (const c of oracle.cases) {
            events.length = 0;
            const sql = compiled.compile(c.request), calls = [...events];
            cases.push({name: c.name, request: c.request, compiled: sql, rows: await compiled.execute(c.request),
                ...(name === 'callbacks' ? {events: calls} : {})});
        }
        result[name] = {source: model.toTytx(), desired: model.toMigration(), cases, ...(oracle.ddl ? {ddl: oracle.ddl} : {})};
        if (name === 'callbacks') result[name].cache = callbackCacheProbe(model);
        if (oracle.errors) result[name].errors = oracle.errors.map(({name, request}) => {
            let rejected = false;
            try { compiled.compile(request); } catch { rejected = true; }
            return {name, request, rejected};
        });
    } finally { await db.close(); }
}
process.stdout.write(JSON.stringify(result));
