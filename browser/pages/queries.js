import {PlaygroundPage, action, databaseControls, detail} from './base.js';
import {queryLabels} from '../catalog.js';
export class QueryPage extends PlaygroundPage {
    static section = 'queries';
    static title = 'Asqueel JS · Query · Gramlot';
    content(root) {
        const section = root.main({class: 'database single-panel'});
        section.h2('Query tramite il modello');
        const body = section.div({class: 'db-content'});
        body.p('Seleziona SQLite · inserimenti e query e applica la migrazione. Esegui gli inserimenti 1–5, poi leggi i dati.');
        databaseControls(body);
        detail(body, 'Piano SQL / operazioni applicate', 'sqlPlan', 'sql-plan');
        body.html_label('Richiesta', {for: 'query-example'});
        const select = body.select({id: 'query-example', value: '^queryExample', disabled: '^busy', connect_onchange: 'playground.selectQuery'});
        for (const [value, label] of Object.entries(queryLabels)) select.option(label, {value});
        body.codeEditor({id: 'query-input', value: '^queryInput', language: 'json', label: 'Richiesta query JSON', disabled: '^busy', connect_onchange: 'playground.editQuery'});
        const buttons = body.div({class: 'db-actions'});
        action(buttons, 'Compila query', 'compileQuery', {id: 'query-compile'});
        action(buttons, 'Esegui query', 'executeQuery', {id: 'query-run'});
        action(buttons, 'Verifica query con Python', 'checkQueries', {id: 'query-test'});
        body.p('^queryStatus', {id: 'query-status', role: 'status', class: '^queryClass'});
        const compiled = detail(body, 'SQL JavaScript e parametri', 'querySQL', 'query-sql', true);
        compiled.pre('^queryParams', {id: 'query-params'});
        detail(body, 'SQL Python di riferimento', 'queryPython', 'query-python');
        detail(body, 'Risultati dal database', 'queryRows', 'query-rows', true);
        detail(body, 'Verifiche query nel browser', 'queryChecks', 'query-checks');
        body.p('Le 18 query sono regressioni del compilatore precedente: non attestano parità query con Python 0.6.1. Gli ID degli INSERT sono fissi; ripeterli segnala un duplicato. Gli hook applicativi non vengono eseguiti.', {class: 'db-note'});
    }
}
