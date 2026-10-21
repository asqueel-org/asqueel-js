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
        view.set('queryPython', expected.sql + '\n\nParametri Python:\n' + JSON.stringify(expected.params, null, 2));
        const sameSQL = compiled.sql === expected.sql, sameParams = equal(compiled.params, expected.params);
        const message = sameSQL ? sameParams ? 'SQL e parametri identici a Python.'
            : 'SQL identico a Python; parametri diversi dall’esempio originale.'
            : 'SQL diverso dal riferimento Python dell’esempio originale.';
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
        view.set('queryRows', 'Query non ancora eseguita.');
        if (previewNow) preview();
    }
    async function execute(test) {
        if (view.get('busy')) return;
        view.set('busy', true);
        try {
            if (test) {
                view.set('queryStatus', 'Verifica delle query su un database separato…');
                const result = await database.request('query-checks');
                view.set('queryChecks', result.map(s => `✓ ${s}`).join('\n'));
                view.set('queryStatus', `${result.length} verifiche browser superate · ${oracle.cases.length + featureOracle.cases.length + readOracle.cases.length + subqueryOracle.cases.length + callbackOracle.cases.length} query confrontate con Python.`);
                view.set('queryClass', '');
            } else {
                const {model, request, compiled, message} = compile();
                const result = await database.request('query', {source: querySource(model), request});
                if (!equal(compiled, result.compiled)) throw new Error('Il worker ha prodotto un SQL diverso dalla preview');
                view.set('queryRows', JSON.stringify(result.records, null, 2));
                database.showDatabase(result);
                view.set('queryStatus', `${['insert', 'update', 'delete'].includes(request.operation) ? `${request.operation.toUpperCase()} completato e salvato.` : `${result.records.length} righe lette.`} ${message}`);
            }
        } catch (error) {
            view.set('queryStatus', error.message); view.set('queryClass', 'error');
            view.set('queryRows', 'Operazione non completata.');
        } finally { view.set('busy', false); }
    }
    load(false);
    return {load, preview, execute, async checkHooks() {
        if (view.get('busy')) return;
        view.set('busy', true);
        view.set('queryStatus', 'Verifica sys_fields e hook su SQLite/IndexedDB…');
        view.set('hookChecks', ''); view.set('hookSample', '');
        try {
            const result = await database.request('hooks-checks');
            view.set('hookChecks', result.checks.map(s => '✓ ' + s).join('\n'));
            view.set('hookSample', JSON.stringify(result.sample, null, 2));
            view.set('queryStatus', `${result.checks.length} cicli sys_fields e hook identici a Python; persistenza verificata dopo riapertura.`);
            view.set('queryClass', '');
        } catch (error) { view.set('queryStatus', error.message); view.set('queryClass', 'error'); }
        finally { view.set('busy', false); }
    }, async checkBehaviors() {
        if (view.get('busy')) return;
        view.set('busy', true);
        view.set('queryStatus', 'Verifica gerarchie e contatori su SQLite/IndexedDB…');
        view.set('behaviorChecks', ''); view.set('behaviorSample', '');
        try {
            const result = await database.request('behaviors-checks');
            view.set('behaviorChecks', result.checks.map(s => '✓ ' + s).join('\n'));
            view.set('behaviorSample', JSON.stringify(result.sample, null, 2));
            view.set('queryStatus', `${result.checks.length} cicli gerarchie e contatori identici a Python; persistenza verificata dopo riapertura.`);
            view.set('queryClass', '');
        } catch (error) { view.set('queryStatus', error.message); view.set('queryClass', 'error'); }
        finally { view.set('busy', false); }
    }, async checkCascades() {
        if (view.get('busy')) return;
        view.set('busy', true);
        view.set('queryStatus', 'Verifica cascade onUpdate su SQLite/IndexedDB…');
        view.set('cascadeChecks', ''); view.set('cascadeSample', '');
        try {
            const result = await database.request('cascades-checks');
            view.set('cascadeChecks', result.checks.map(s => '✓ ' + s).join('\n'));
            view.set('cascadeSample', JSON.stringify(result.sample, null, 2));
            view.set('queryStatus', `${result.checks.length} cicli cascade onUpdate identici a Python; persistenza verificata dopo riapertura.`);
            view.set('queryClass', '');
        } catch (error) { view.set('queryStatus', error.message); view.set('queryClass', 'error'); }
        finally { view.set('busy', false); }
    }, invalidate() {
        view.set('queryStatus', 'Modello cambiato: ricompila la query.');
        view.set('queryRows', 'Risultati da aggiornare.'); view.set('querySQL', ''); view.set('queryParams', '');
    }};
}
