import {PlaygroundPage, databaseControls, detail} from './base.js';
export class SQLitePage extends PlaygroundPage {
    static section = 'sqlite';
    static title = 'Asqueel JS · SQLite migrations · Gramlot';
    content(root) {
        const section = root.main({class: 'database single-panel'});
        section.h2('Database in the browser');
        const body = section.div({class: 'db-content'});
        body.p('Compute the plan, apply it and move to version 2: it adds email and its index keeping the data.');
        databaseControls(body, {seed: true, checks: true});
        detail(body, 'SQL plan / applied operations', 'sqlPlan', 'sql-plan', true);
        detail(body, 'Schema read from the database', 'dbSchema', 'db-schema');
        detail(body, 'Browser checks and Python comparison', 'dbChecks', 'db-checks-result');
        body.p('Local database of this site. Creation and compatible additions; unsupported changes are blocked. The data survives a reload. Clearing the site data deletes it.', {class: 'db-note'});
    }
}
