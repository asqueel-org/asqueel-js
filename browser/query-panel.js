import oracle from '../test/fixtures/queries.json' with {type: 'json'};
import {querySource} from '../src/queries.js';
import {equal} from '../src/sqlite.js';

export function queryPanel(database, getModel) {
    const selector = document.querySelector('#query-example');
    const editor = document.querySelector('#query-input');
    const status = document.querySelector('#query-status');
    const sql = document.querySelector('#query-sql');
    const python = document.querySelector('#query-python');
    const params = document.querySelector('#query-params');
    const rows = document.querySelector('#query-rows');
    const checks = document.querySelector('#query-checks');
    const labels = {insert_person: '1 · Inserisci Ada', insert_quoted: '2 · Inserisci nome con apostrofo',
        insert_memo: '3 · Inserisci nota di Ada', insert_null: '4 · Inserisci nota vuota',
        insert_no_return: '5 · Inserisci seconda nota', people: 'Leggi persone',
        active_people: 'Filtra persone attive', related_notes: 'Leggi note e nome della persona (JOIN)',
        collection: 'Filtro IN', empty_collection: 'IN vuoto', not_in_empty: 'NOT IN vuoto',
        binding_collision: 'Parametri con nomi simili', page: 'Pagina di risultati',
        offset_only: 'Solo offset', zero_limit: 'Limit zero', null_filter: 'Filtro IS NULL',
        quoted_expression: 'Stringa letterale nella query', total: 'Somma importi'};
    for (const c of oracle.cases) {
        const option = document.createElement('option');
        option.value = c.name; option.textContent = labels[c.name];
        selector.append(option);
    }
    selector.value = 'insert_person';
    let busy = false;
    function compile() {
        const model = getModel();
        const request = JSON.parse(editor.value);
        const compiled = model.queries().compile(request);
        const expected = oracle.cases.find(c => c.name === selector.value).compiled;
        sql.textContent = compiled.sql;
        params.textContent = JSON.stringify(compiled.params, null, 2);
        python.textContent = expected.sql + '\n\nParametri Python:\n' + JSON.stringify(expected.params, null, 2);
        const sameSQL = compiled.sql === expected.sql, sameParams = equal(compiled.params, expected.params);
        const message = sameSQL ? sameParams ? 'SQL e parametri identici a Python.'
            : 'SQL identico a Python; parametri diversi dall’esempio originale.'
            : 'SQL diverso dal riferimento Python dell’esempio originale.';
        status.className = sameSQL && sameParams ? '' : 'changed';
        status.textContent = message;
        return {model, request, compiled, message};
    }
    function preview() {
        try { compile(); }
        catch (error) { status.textContent = error.message; status.className = 'error'; sql.textContent = ''; params.textContent = ''; }
    }
    function load() {
        editor.value = JSON.stringify(oracle.cases.find(c => c.name === selector.value).request, null, 2);
        rows.textContent = 'Query non ancora eseguita.';
        preview();
    }
    selector.addEventListener('change', load);
    editor.addEventListener('input', () => { status.textContent = 'Richiesta modificata: ricompila per confrontare il SQL.'; });
    document.querySelector('#query-compile').addEventListener('click', preview);
    async function execute(test) {
        if (busy) return;
        busy = true;
        const controls = [...document.querySelectorAll('button, select, textarea')];
        const previous = controls.map(c => c.disabled);
        controls.forEach(c => { c.disabled = true; });
        try {
            if (test) {
                status.textContent = 'Verifica delle query su un database separato…';
                const result = await database.request('query-checks');
                checks.textContent = result.map(s => `✓ ${s}`).join('\n');
                status.textContent = `${result.length} verifiche browser superate · ${oracle.cases.length} query confrontate con Python.`;
                status.className = '';
            } else {
                const {model, request, compiled, message} = compile();
                const result = await database.request('query', {source: querySource(model), request});
                if (!equal(compiled, result.compiled)) throw new Error('Il worker ha prodotto un SQL diverso dalla preview');
                rows.textContent = JSON.stringify(result.records, null, 2);
                database.showDatabase(result);
                status.textContent = `${request.operation === 'insert' ? 'INSERT completato e salvato.' : `${result.records.length} righe lette.`} ${message}`;
            }
        } catch (error) {
            status.textContent = error.message;
            status.className = 'error';
            rows.textContent = 'Operazione non completata.';
        } finally {
            controls.forEach((c, i) => { c.disabled = previous[i]; });
            busy = false;
        }
    }
    document.querySelector('#query-run').addEventListener('click', () => execute(false));
    document.querySelector('#query-test').addEventListener('click', () => execute(true));
    // Preview on demand: the selected model may be one of the older examples.
    editor.value = JSON.stringify(oracle.cases[0].request, null, 2);
    return {invalidate() {
        status.textContent = 'Modello cambiato: ricompila la query.';
        rows.textContent = 'Risultati da aggiornare.';
        sql.textContent = ''; params.textContent = '';
    }};
}
