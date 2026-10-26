import {Page} from '@gramlot/gramlot/page';
import {exampleLabels} from '../catalog.js';

export function action(parent, label, func, attributes = {}, args = {}) {
    const button = parent.button(label, {disabled: '^busy', ...attributes});
    button.dataController({func: 'playground.' + func, ...args});
    return button;
}
export function detail(parent, title, path, id, open = false) {
    const box = parent.details({class: 'db-detail', open});
    box.summary(title);
    box.pre('^' + path, {id});
    return box;
}
export function databaseControls(parent, {seed = false, checks = false} = {}) {
    const buttons = parent.div({class: 'db-actions'});
    for (const [command, label] of [
        ['plan', 'Compute SQL plan'], ['apply', 'Apply migration'],
        ...(seed ? [['seed', 'Insert sample data']] : []),
        ['reopen', 'Reopen database'],
        ...(checks ? [['checks', 'Check SQLite'], ['composition-checks', 'Check composition with Python']] : []),
    ]) action(buttons, label, 'database', {'data-db': command}, {command});
    parent.p('^dbStatus', {id: 'db-status', role: 'status', class: '^dbClass'});
    parent.p('^dbRows', {id: 'db-rows'});
}
export class PlaygroundPage extends Page {
    static css_theme = 'gramlot-base';
    static css = ['/themes/gramlot-compact/theme.css', '/style.css'];
    static devices = ['desktop', 'tablet', 'phone'];
    main(root) {
        const name = this.constructor.section;
        for (const [path, value] of Object.entries({
            section: name, busy: true, ready: false, example: 'queries', source: '',
            output: 'javascript', json: '', result: '', status: 'Loading the model…', statusClass: '',
            modelJSON: '', modelStatus: '', differences: '', noDifferences: true, noJSON: true,
            dbStatus: 'Starting SQLite…', dbClass: '', dbRows: '', dbSchema: '', dbChecks: '',
            sqlPlan: 'Compute the plan to read the statements before applying them.',
            queryExample: 'insert_person', queryInput: '', queryStatus: 'Compile to compare SQL and parameters.',
            queryClass: '', querySQL: '', queryParams: '', queryPython: '', queryRows: 'Query not run yet.', queryChecks: '',
            offlineStatus: 'Preparing the offline cache…', connectionStatus: '',
            transferRequest: JSON.stringify({operation:'update',table:'work.document',values:{id:'d1',title:'Changed offline'}},null,2),
            transferStatus: '',  transferChecks: '', transferSample: '', transferBinarySample: '', transferFileName: 'No file selected',
            importTable: 'notes.person', importFileName: 'No file selected', importStatus: '', importChecks: '', importSample: '',
            hookChecks: '', hookSample: '', behaviorChecks: '', behaviorSample: '', cascadeChecks: '', cascadeSample: '',
        })) root.dataSetter({destination_path: path, value});
        const frame = root.div({class: 'playground', 'data-gramlot-page': name});
        const shell = frame.div({class: 'page-content'});
        const header = shell.header();
        const title = header.div();
        title.p('ASQUEEL JS / GRAMLOT', {class: 'eyebrow'});
        title.h1({models: 'The whole model.', sqlite: 'From the model to the database.', queries: 'Local data, verifiable queries.', transfer: 'Work continues offline.'}[name]);
        title.p('JavaScript models · Python reference 0.9.0 · baf4582 · SQLite persisted in IndexedDB');
        if (name !== 'transfer') {
            const toolbar = shell.div({class: 'toolbar'});
            toolbar.html_label('Example', {for: 'example'});
            const select = toolbar.select({id: 'example', value: '^example', disabled: '^busy', connect_onchange: 'playground.selectExample'});
            for (const [value, label] of Object.entries(exampleLabels)) select.option(label, {value});
            action(toolbar, 'Restore example', 'restore', {id: 'restore'});
            action(toolbar, 'Generate JSON', 'render', {id: 'render'});
            toolbar.span('The model draft is shared by these pages.');
            shell.p('^status', {id: 'status', role: 'status', class: '^statusClass'});
            const diff = shell.details({id: 'comparison', hidden: '^noDifferences'});
            diff.summary('JavaScript / Python differences');
            diff.pre('^differences', {id: 'differences'});
        }
        this.content(shell);
        const footer = shell.footer();
        footer.span('Gramlot pages · Source in the worker · Data and Logic in the browser · ');
        footer.a('Manual', {href: 'https://asqueel-js.readthedocs.io/en/latest/', target: '_blank', rel: 'noreferrer'});
        root.dataController({func: 'playground.start', _onStart: true});
    }
}
