import {PlaygroundPage, action} from './base.js';
export class ModelPage extends PlaygroundPage {
    static section = 'models';
    static title = 'Asqueel JS · Modello · Gramlot';
    content(root) {
        const grid = root.main({class: 'model-grid'});
        const editor = grid.section();
        editor.h2('Modello JavaScript');
        editor.p('La variabile root è già disponibile. Il codice viene eseguito localmente.', {class: 'hint'});
        editor.codeEditor({id: 'model', value: '^source', language: 'javascript', label: 'Modello JavaScript', disabled: '^busy', connect_onchange: 'playground.editModel'});
        const output = grid.section();
        const heading = output.h2();
        heading.html_label('Migrazione', {for: 'output'});
        const select = heading.select({id: 'output', value: '^output', connect_onchange: 'playground.showOutput'});
        select.option('JSON JavaScript', {value: 'javascript'});
        select.option('Riferimento Python', {value: 'python'});
        output.pre('^result', {id: 'result', 'aria-label': 'JSON della migrazione'});
        action(output.div({class: 'panel-actions'}), 'Scarica JSON', 'download', {id: 'download', disabled: '^noJSON'});
        const model = root.details({id: 'resolved', class: 'full-model'});
        const summary = model.summary('Modello risolto completo · ');
        summary.span('^modelStatus', {id: 'model-status'});
        model.pre('^modelJSON', {id: 'resolved-model'});
        const checks = root.section({class: 'database'});
        checks.h2('Confronto completo con Python');
        const body = checks.div({class: 'db-content'});
        body.p('Tutti i casi di composizione, modello e migrate vengono verificati nel browser. Le prove di persistenza usano database separati.');
        action(body, 'Verifica composizione con Python', 'database', {'data-db': 'composition-checks'}, {command: 'composition-checks'});
        body.p('^dbStatus', {id: 'db-status', role: 'status', class: '^dbClass'});
        body.pre('^dbChecks', {id: 'db-checks-result', class: 'checks-output'});
    }
}
