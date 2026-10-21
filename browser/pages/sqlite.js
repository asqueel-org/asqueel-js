import {PlaygroundPage, databaseControls, detail} from './base.js';
export class SQLitePage extends PlaygroundPage {
    static section = 'sqlite';
    static title = 'Asqueel JS · Migrazioni SQLite · Gramlot';
    content(root) {
        const section = root.main({class: 'database single-panel'});
        section.h2('Database nel browser');
        const body = section.div({class: 'db-content'});
        body.p('Calcola il piano, applicalo e passa alla versione 2: aggiunge email e il suo indice conservando i dati.');
        databaseControls(body, {seed: true, checks: true});
        detail(body, 'Piano SQL / operazioni applicate', 'sqlPlan', 'sql-plan', true);
        detail(body, 'Schema letto dal database', 'dbSchema', 'db-schema');
        detail(body, 'Verifiche browser e confronto Python', 'dbChecks', 'db-checks-result');
        body.p('Database locale di questo sito. Creazione e aggiunte compatibili; le modifiche non supportate vengono bloccate. I dati sopravvivono al reload. Cancellare i dati del sito li elimina.', {class: 'db-note'});
    }
}
