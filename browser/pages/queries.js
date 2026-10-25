import {PlaygroundPage, action, databaseControls, detail} from './base.js';
import {queryLabels} from '../catalog.js';
export class QueryPage extends PlaygroundPage {
    static section = 'queries';
    static title = 'Asqueel JS · Queries · Gramlot';
    content(root) {
        const section = root.main({class: 'database single-panel'});
        section.h2('Queries through the model');
        const body = section.div({class: 'db-content'});
        body.p('Select SQLite · inserts and queries and apply the migration. Run inserts 1–5, then read the data.');
        databaseControls(body);
        detail(body, 'SQL plan / applied operations', 'sqlPlan', 'sql-plan');
        const importing = body.details({class: 'db-detail', open: true});
        importing.summary('Import CSV, JSON or TYTX');
        importing.html_label('Model table', {for: 'import-table'});
        importing.input({id: 'import-table', type: 'text', value: '^importTable', disabled: '^busy'});
        importing.html_label('Local file', {for: 'import-file'});
        importing.input({id: 'import-file', type: 'file', accept: '.csv,.json,.tytx', disabled: '^busy', connect_onchange: 'playground.selectImportFile'});
        importing.p('^importFileName', {id: 'import-file-name'});
        const importButtons = importing.div({class: 'db-actions'});
        action(importButtons, 'Import file', 'importFile', {id: 'import-run'});
        action(importButtons, 'Check imports with Python', 'checkImports', {id: 'import-test'});
        importing.p('CSV with headers and comma separator; JSON as an array of records; TYTX with one record per line. Fields must match the model columns. Atomic import without triggers, as sql_insert in Python.', {class: 'db-note'});
        importing.p('^importStatus', {id: 'import-status', role: 'status'});
        detail(importing, 'Import checks in the browser', 'importChecks', 'import-checks');
        detail(importing, 'TYTX example: SQL, parameters and data', 'importSample', 'import-sample');

        body.html_label('Request', {for: 'query-example'});
        const select = body.select({id: 'query-example', value: '^queryExample', disabled: '^busy', connect_onchange: 'playground.selectQuery'});
        for (const [value, label] of Object.entries(queryLabels)) select.option(label, {value});
        body.codeEditor({id: 'query-input', value: '^queryInput', language: 'json', label: 'JSON query request', disabled: '^busy', connect_onchange: 'playground.editQuery'});
        const buttons = body.div({class: 'db-actions'});
        action(buttons, 'Compile query', 'compileQuery', {id: 'query-compile'});
        action(buttons, 'Run query', 'executeQuery', {id: 'query-run'});
        action(buttons, 'Check queries with Python', 'checkQueries', {id: 'query-test'});
        body.p('The comparison includes #PERIOD with the @genrojs/toolbox natural-language date parser (explicit locale and workdate), #TEMPLATE and #IN_RANGE, dynamic callbacks (formulas, subqueries, #ENV and columns), EXISTS and inverse aggregations (counts, sums, concatenations and JSON), with SQLite execution and IndexedDB reopen.', {class: 'db-note'});
        action(buttons, 'Check sysFields and hooks', 'checkHooks', {id: 'hooks-test'});
        action(buttons, 'Check hierarchies and counters', 'checkBehaviors', {id: 'behaviors-test'});
        action(buttons, 'Check onUpdate cascades', 'checkCascades', {id: 'cascades-test'});
        body.p('^queryStatus', {id: 'query-status', role: 'status', class: '^queryClass'});
        const compiled = detail(body, 'JavaScript SQL and parameters', 'querySQL', 'query-sql', true);
        compiled.pre('^queryParams', {id: 'query-params'});
        detail(body, 'Reference Python SQL', 'queryPython', 'query-python');
        detail(body, 'Results from the database', 'queryRows', 'query-rows', true);
        detail(body, 'Query checks in the browser', 'queryChecks', 'query-checks');
        detail(body, 'sysFields and hook checks', 'hookChecks', 'hooks-checks', true);
        detail(body, 'Verified example: records, events and hook writes', 'hookSample', 'hooks-sample');
        detail(body, 'Hierarchy and counter checks', 'behaviorChecks', 'behaviors-checks', true);
        detail(body, 'Verified move: subtree, positions and SQL', 'behaviorSample', 'behaviors-sample');
        detail(body, 'Application onUpdate cascade checks', 'cascadeChecks', 'cascades-checks', true);
        detail(body, 'Verified cascade: children, hooks and SQL', 'cascadeSample', 'cascades-sample');
        body.p('SQL, parameters and results are compared with Python 0.7.0 · 84408eb. Run the numbered examples in order; a repeated INSERT reports a duplicate. The checks use separate databases and run real hooks, hierarchies and counters, also with errors, rollback and IndexedDB reopen.', {class: 'db-note'});
    }
}
