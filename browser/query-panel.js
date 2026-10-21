import oracle from '../test/fixtures/queries.json' with {type: 'json'};
import {querySource} from '../src/queries.js';
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
                view.set('queryStatus', `${result.length} verifiche browser superate · ${oracle.cases.length} query confrontate con Python.`);
                view.set('queryClass', '');
            } else {
                const {model, request, compiled, message} = compile();
                const result = await database.request('query', {source: querySource(model), request});
                if (!equal(compiled, result.compiled)) throw new Error('Il worker ha prodotto un SQL diverso dalla preview');
                view.set('queryRows', JSON.stringify(result.records, null, 2));
                database.showDatabase(result);
                view.set('queryStatus', `${request.operation === 'insert' ? 'INSERT completato e salvato.' : `${result.records.length} righe lette.`} ${message}`);
            }
        } catch (error) {
            view.set('queryStatus', error.message); view.set('queryClass', 'error');
            view.set('queryRows', 'Operazione non completata.');
        } finally { view.set('busy', false); }
    }
    load(false);
    return {load, preview, execute, invalidate() {
        view.set('queryStatus', 'Modello cambiato: ricompila la query.');
        view.set('queryRows', 'Risultati da aggiornare.'); view.set('querySQL', ''); view.set('queryParams', '');
    }};
}
