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
        body.p('Il confronto include formule, sottoquery, EXISTS e aggregazioni inverse (conteggi, somme, concatenazioni e JSON), con esecuzione SQLite e riapertura di IndexedDB.', {class: 'db-note'});
        action(buttons, 'Verifica sys_fields e hook', 'checkHooks', {id: 'hooks-test'});
        action(buttons, 'Verifica gerarchie e contatori', 'checkBehaviors', {id: 'behaviors-test'});
        action(buttons, 'Verifica cascade onUpdate', 'checkCascades', {id: 'cascades-test'});
        body.p('^queryStatus', {id: 'query-status', role: 'status', class: '^queryClass'});
        const compiled = detail(body, 'SQL JavaScript e parametri', 'querySQL', 'query-sql', true);
        compiled.pre('^queryParams', {id: 'query-params'});
        detail(body, 'SQL Python di riferimento', 'queryPython', 'query-python');
        detail(body, 'Risultati dal database', 'queryRows', 'query-rows', true);
        detail(body, 'Verifiche query nel browser', 'queryChecks', 'query-checks');
        detail(body, 'Verifiche sys_fields e hook', 'hookChecks', 'hooks-checks', true);
        detail(body, 'Esempio verificato: record, eventi e scritture degli hook', 'hookSample', 'hooks-sample');
        detail(body, 'Verifiche gerarchie e contatori', 'behaviorChecks', 'behaviors-checks', true);
        detail(body, 'Spostamento verificato: sottoalbero, posizioni e SQL', 'behaviorSample', 'behaviors-sample');
        detail(body, 'Verifiche cascade applicative onUpdate', 'cascadeChecks', 'cascades-checks', true);
        detail(body, 'Cascade verificata: figli, hook e SQL', 'cascadeSample', 'cascades-sample');
        body.p('SQL, parametri e risultati sono confrontati con Python 0.6.1 + fix #44. Gli esempi numerati vanno eseguiti in ordine; gli INSERT ripetuti segnalano un duplicato. Le verifiche usano database separati. Le verifiche eseguono hook reali, gerarchie e contatori, anche con errori, rollback e riapertura di IndexedDB.', {class: 'db-note'});
    }
}
