import periodOracle from '../test/fixtures/periods.json' with {type: 'json'};
import macroOracle from '../test/fixtures/macros.json' with {type: 'json'};
import oracle from '../test/fixtures/queries.json' with {type: 'json'};
import {querySource} from '../src/queries.js';
import featureOracle from '../test/fixtures/query-features.json' with {type: 'json'};
import readOracle from '../test/fixtures/reads.json' with {type: 'json'};
import callbackOracle from '../test/fixtures/callbacks.json' with {type: 'json'};
import subqueryOracle from '../test/fixtures/subqueries.json' with {type: 'json'};
import {equal} from '../src/sqlite.js';

export function queryPanel(view, database, getModel) {
    function compile() {
        const model = getModel(), request = JSON.parse(view.get('queryInput'));
        const compiled = model.queries().compile(request);
        const expected = oracle.cases.find(c => c.name === view.get('queryExample')).compiled;
        view.set('querySQL', compiled.sql);
        view.set('queryParams', JSON.stringify(compiled.params, null, 2));
        view.set('queryPython', expected.sql + '\n\nPython parameters:\n' + JSON.stringify(expected.params, null, 2));
        const sameSQL = compiled.sql === expected.sql, sameParams = equal(compiled.params, expected.params);
        const message = sameSQL ? sameParams ? 'SQL and parameters identical to Python.'
            : 'SQL identical to Python; parameters differ from the original example.'
            : 'SQL differs from the Python reference of the original example.';
        view.set('queryClass', sameSQL && sameParams ? '' : 'changed');
        view.set('queryStatus', message);
        return {model, request, compiled, message};
    }
    function preview() {
        try { compile(); }
        catch (error) {
            view.set('queryStatus', error.message); view.set('queryClass', 'error');
            view.set('querySQL', ''); view.set('queryParams', '');
        }
    }
    function load(previewNow = true) {
        view.set('queryInput', JSON.stringify(oracle.cases.find(c => c.name === view.get('queryExample')).request, null, 2));
        view.set('queryRows', 'Query not run yet.');
        if (previewNow) preview();
    }
    async function execute(test) {
        if (view.get('busy')) return;
        view.set('busy', true);
        try {
            if (test) {
                view.set('queryStatus', 'Checking the queries on a separate database…');
                const result = await database.request('query-checks');
                view.set('queryChecks', result.map(s => `✓ ${s}`).join('\n'));
                view.set('queryStatus', `${result.length} browser checks passed · ${oracle.cases.length + featureOracle.cases.length + readOracle.cases.length + subqueryOracle.cases.length + callbackOracle.cases.length + macroOracle.cases.length + periodOracle.cases.length} queries compared with Python.`);
                view.set('queryClass', '');
            } else {
                const {model, request, compiled, message} = compile();
                const result = await database.request('query', {source: querySource(model), request});
                if (!equal(compiled, result.compiled)) throw new Error('The worker produced SQL that differs from the preview');
                view.set('queryRows', JSON.stringify(result.records, null, 2));
                database.showDatabase(result);
                view.set('queryStatus', `${['insert', 'update', 'delete'].includes(request.operation) ? `${request.operation.toUpperCase()} completed and saved.` : `${result.records.length} rows read.`} ${message}`);
            }
        } catch (error) {
            view.set('queryStatus', error.message); view.set('queryClass', 'error');
            view.set('queryRows', 'Operation not completed.');
        } finally { view.set('busy', false); }
    }
    load(false);
    return {load, preview, execute,
    async importFile(file) {
        if (view.get('busy')) return;
        if (!file) {view.set('importStatus', 'Select a CSV, JSON or TYTX file.'); return;}
        view.set('busy', true);
        view.set('importStatus', 'Local import in progress…');
        try {
            const result = await database.request('import', {source: querySource(getModel()), table: view.get('importTable'), file});
            database.showDatabase(result);
            view.set('importStatus', `${result.count} records imported and saved in IndexedDB.`);
        } catch (error) {view.set('importStatus', `Import cancelled: ${error.message}`);}
        finally {view.set('busy', false);}
    },
    async checkImports() {
        if (view.get('busy')) return;
        view.set('busy', true);
        view.set('importStatus', 'Comparing imports with Python on SQLite/IndexedDB…');
        try {
            const result = await database.request('import-checks');
            view.set('importChecks', result.checks.map(s => '✓ ' + s).join('\n'));
            view.set('importSample', JSON.stringify(result.sample, null, 2));
            view.set('importStatus', `${result.checks.length} imports identical to Python: SQL, parameters, data and rollback; IndexedDB reopen verified.`);
        } catch (error) {view.set('importStatus', error.message);}
        finally {view.set('busy', false);}
    }, async checkHooks() {
        if (view.get('busy')) return;
        view.set('busy', true);
        view.set('queryStatus', 'Checking sysFields and hooks on SQLite/IndexedDB…');
        view.set('hookChecks', ''); view.set('hookSample', '');
        try {
            const result = await database.request('hooks-checks');
            view.set('hookChecks', result.checks.map(s => '✓ ' + s).join('\n'));
            view.set('hookSample', JSON.stringify(result.sample, null, 2));
            view.set('queryStatus', `${result.checks.length} sysFields and hook cycles identical to Python; persistence verified after reopen.`);
            view.set('queryClass', '');
        } catch (error) { view.set('queryStatus', error.message); view.set('queryClass', 'error'); }
        finally { view.set('busy', false); }
    }, async checkBehaviors() {
        if (view.get('busy')) return;
        view.set('busy', true);
        view.set('queryStatus', 'Checking hierarchies and counters on SQLite/IndexedDB…');
        view.set('behaviorChecks', ''); view.set('behaviorSample', '');
        try {
            const result = await database.request('behaviors-checks');
            view.set('behaviorChecks', result.checks.map(s => '✓ ' + s).join('\n'));
            view.set('behaviorSample', JSON.stringify(result.sample, null, 2));
            view.set('queryStatus', `${result.checks.length} hierarchy and counter cycles identical to Python; persistence verified after reopen.`);
            view.set('queryClass', '');
        } catch (error) { view.set('queryStatus', error.message); view.set('queryClass', 'error'); }
        finally { view.set('busy', false); }
    }, async checkCascades() {
        if (view.get('busy')) return;
        view.set('busy', true);
        view.set('queryStatus', 'Checking onUpdate cascades on SQLite/IndexedDB…');
        view.set('cascadeChecks', ''); view.set('cascadeSample', '');
        try {
            const result = await database.request('cascades-checks');
            view.set('cascadeChecks', result.checks.map(s => '✓ ' + s).join('\n'));
            view.set('cascadeSample', JSON.stringify(result.sample, null, 2));
            view.set('queryStatus', `${result.checks.length} onUpdate cascade cycles identical to Python; persistence verified after reopen.`);
            view.set('queryClass', '');
        } catch (error) { view.set('queryStatus', error.message); view.set('queryClass', 'error'); }
        finally { view.set('busy', false); }
    }, invalidate() {
        view.set('queryStatus', 'Model changed: recompile the query.');
        view.set('queryRows', 'Results to refresh.'); view.set('querySQL', ''); view.set('queryParams', '');
    }};
}
