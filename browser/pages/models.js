import {PlaygroundPage, action} from './base.js';
export class ModelPage extends PlaygroundPage {
    static section = 'models';
    static title = 'Asqueel JS · Models · Gramlot';
    content(root) {
        const grid = root.main({class: 'model-grid'});
        const editor = grid.section();
        editor.h2('JavaScript model');
        editor.p('The root variable is already available. The code runs locally.', {class: 'hint'});
        editor.codeEditor({id: 'model', value: '^source', language: 'javascript', label: 'JavaScript model', disabled: '^busy', connect_onchange: 'playground.editModel'});
        const output = grid.section();
        const heading = output.h2();
        heading.html_label('Migration', {for: 'output'});
        const select = heading.select({id: 'output', value: '^output', connect_onchange: 'playground.showOutput'});
        select.option('JSON JavaScript', {value: 'javascript'});
        select.option('Python reference', {value: 'python'});
        output.pre('^result', {id: 'result', 'aria-label': 'Migration JSON'});
        action(output.div({class: 'panel-actions'}), 'Download JSON', 'download', {id: 'download', disabled: '^noJSON'});
        const model = root.details({id: 'resolved', class: 'full-model'});
        const summary = model.summary('Composed TYTX source · ');
        summary.span('^modelStatus', {id: 'model-status'});
        model.pre('^modelJSON', {id: 'composed-source'});
        const checks = root.section({class: 'database'});
        checks.h2('Complete comparison with Python');
        const body = checks.div({class: 'db-content'});
        body.p('Every composition, model and migration case is checked in the browser. The persistence checks use separate databases.');
        action(body, 'Check composition with Python', 'database', {'data-db': 'composition-checks'}, {command: 'composition-checks'});
        body.p('^dbStatus', {id: 'db-status', role: 'status', class: '^dbClass'});
        body.pre('^dbChecks', {id: 'db-checks-result', class: 'checks-output'});
    }
}
