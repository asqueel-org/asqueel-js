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
        ['plan', 'Calcola piano SQL'], ['apply', 'Applica migrazione'],
        ...(seed ? [['seed', 'Inserisci dati di prova']] : []),
        ['reopen', 'Riapri database'],
        ...(checks ? [['checks', 'Verifica SQLite'], ['composition-checks', 'Verifica composizione con Python']] : []),
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
            output: 'javascript', json: '', result: '', status: 'Caricamento del modello…', statusClass: '',
            modelJSON: '', modelStatus: '', differences: '', noDifferences: true, noJSON: true,
            dbStatus: 'Avvio SQLite…', dbClass: '', dbRows: '', dbSchema: '', dbChecks: '',
            sqlPlan: 'Calcola il piano per leggere le istruzioni prima di applicarle.',
            queryExample: 'insert_person', queryInput: '', queryStatus: 'Compila per confrontare SQL e parametri.',
            queryClass: '', querySQL: '', queryParams: '', queryPython: '', queryRows: 'Query non ancora eseguita.', queryChecks: '',
            hookChecks: '', hookSample: '',
        })) root.dataSetter({destination_path: path, value});
        const frame = root.div({class: 'playground', 'data-gramlot-page': name});
        const shell = frame.div({class: 'page-content'});
        const header = shell.header();
        const title = header.div();
        title.p('ASQUEEL JS / GRAMLOT', {class: 'eyebrow'});
        title.h1({models: 'Il modello, per intero.', sqlite: 'Dal modello al database.', queries: 'Dati locali, query verificabili.'}[name]);
        title.p('Modelli JavaScript · riferimento Python 0.6.1 · SQLite persistito su IndexedDB');
        const toolbar = shell.div({class: 'toolbar'});
        toolbar.html_label('Esempio', {for: 'example'});
        const select = toolbar.select({id: 'example', value: '^example', disabled: '^busy', connect_onchange: 'playground.selectExample'});
        for (const [value, label] of Object.entries(exampleLabels)) select.option(label, {value});
        action(toolbar, 'Ripristina esempio', 'restore', {id: 'restore'});
        action(toolbar, 'Genera JSON', 'render', {id: 'render'});
        toolbar.span('La bozza del modello è condivisa tra queste pagine.');
        shell.p('^status', {id: 'status', role: 'status', class: '^statusClass'});
        const diff = shell.details({id: 'comparison', hidden: '^noDifferences'});
        diff.summary('Differenze JavaScript / Python');
        diff.pre('^differences', {id: 'differences'});
        this.content(shell);
        const footer = shell.footer();
        footer.span('Pagine Gramlot · Source nel worker · Data e Logic nel browser · ');
        footer.a('Contratto e limiti', {href: 'https://github.com/asqueel-org/asqueel-js/blob/main/docs/model.md', target: '_blank', rel: 'noreferrer'});
        root.dataController({func: 'playground.start', _onStart: true});
    }
}
