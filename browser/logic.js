import {transferPanel} from './transfer-panel.js';
import {defineModel} from '../src/index.js';
import {examples, modelExamples, diff} from './recipes.js';
import {sqlitePanel} from './sqlite-panel.js';
import {queryPanel} from './query-panel.js';
const DRAFT = 'asqueel-playground-draft-v1';
const sourceOf = recipe => {
    const source = recipe.toString();
    return source.slice(source.indexOf('{') + 1, source.lastIndexOf('}')).trim();
};

export class Logic {
    async start(node) {
        this.view = {get: key => node.GET(key), set: (key, value) => {
            node.SET(key, value);
            if (key === 'busy' && value === false && this.pendingDraft) {
                const draft = this.pendingDraft;
                this.pendingDraft = null;
                this.receiveDraft(draft);
            }
        }};
        let example = 'queries', source;
        try {
            const selected = localStorage.getItem('asqueel-example');
            if (Object.hasOwn(examples, selected)) example = selected;
            const draft = JSON.parse(localStorage.getItem(DRAFT));
            if (draft && Object.hasOwn(examples, draft.example) && typeof draft.source === 'string') {
                example = draft.example; source = draft.source;
            }
        } catch {}
        this.view.set('example', example);
        this.view.set('source', source ?? sourceOf(examples[example].recipe));
        this.render();
        // A worker created before service-worker control may keep fetching WASM
        // directly from the network, even after the page reports offline readiness.
        await window.offlineReady.catch(() => {});
        if (this.page.abort.signal.aborted) return;
        this.db = sqlitePanel(this.view, () => {
            this.render();
            if (!this.view.get('json')) throw new Error('Correggi il modello prima di migrare');
            return JSON.parse(this.view.get('json'));
        }, () => this.view.get('example'));
        this.transfers = transferPanel(this.view, this.db);
        this.queries = queryPanel(this.view, this.db, () => defineModel(new Function('root', this.view.get('source'))));
        this.page.abort.signal.addEventListener('abort', () => this.db.dispose(), {once: true});
        window.addEventListener('storage', event => {
            if (event.key !== DRAFT || !event.newValue) return;
            try { this.receiveDraft(JSON.parse(event.newValue)); } catch {}
        }, {signal: this.page.abort.signal});
        this.view.set('busy', false);
        await this.db.run('inspect');
        if (this.view.get('section') === 'transfer') await this.transfers.resume();
        const connection = () => this.view.set('connectionStatus', navigator.onLine ? 'Rete disponibile' : 'Offline · lavoro sul database locale');
        connection();
        for (const event of ['online','offline']) window.addEventListener(event, connection, {signal:this.page.abort.signal});
        window.offlineReady.then(() => this.view.set('offlineStatus','App pronta per la riapertura senza rete: pagina, worker e SQLite WASM salvati.'))
            .catch(error => this.view.set('offlineStatus', `Cache offline non disponibile: ${error.message}`));
        this.view.set('ready', true);
    }
    saveDraft() {
        try {
            localStorage.setItem('asqueel-example', this.view.get('example'));
            localStorage.setItem(DRAFT, JSON.stringify({example: this.view.get('example'), source: this.view.get('source')}));
        } catch {} // Browsing without localStorage still supports the live page.
    }
    receiveDraft(draft) {
        if (!draft || !Object.hasOwn(examples, draft.example) || typeof draft.source !== 'string') return;
        if (this.view.get('busy')) { this.pendingDraft = draft; return; }
        if (draft.source === this.view.get('source') && draft.example === this.view.get('example')) return;
        this.view.set('example', draft.example);
        this.view.set('source', draft.source);
        this.render(); this.db?.invalidate(); this.queries?.invalidate();
    }
    selectExample() {
        this.restore();
    }
    restore() {
        this.view.set('source', sourceOf(examples[this.view.get('example')].recipe));
        this.view.set('output', 'javascript');
        this.saveDraft(); this.render(); this.db?.invalidate(); this.queries?.invalidate();
    }
    editModel() {
        this.saveDraft(); this.db?.invalidate(); this.queries?.invalidate();
        this.view.set('status', 'Modello modificato: genera il JSON per aggiornare il confronto.');
        this.view.set('statusClass', 'changed');
        this.view.set('noJSON', true); // Do not download a stale projection.
    }
    showOutput() {
        this.view.set('result', this.view.get('output') === 'python'
            ? JSON.stringify(examples[this.view.get('example')].expected, null, 2) : this.view.get('json'));
    }
    render() {
        try {
            const key = this.view.get('example');
            const model = defineModel(new Function('root', this.view.get('source')));
            const structure = model.toMigration(), full = model.toJSON(), expectedModel = modelExamples[key]?.model;
            this.view.set('modelJSON', JSON.stringify(full, null, 2));
            const modelDelta = expectedModel ? diff(full, expectedModel) : [];
            this.view.set('modelStatus', expectedModel
                ? modelDelta.length ? `${modelDelta.length} differenze nel modello completo` : 'Modello completo identico a Python 0.6.1'
                : 'Modello completo JS · confronto migrate disponibile');
            this.view.set('json', JSON.stringify(structure, null, 2));
            this.showOutput();
            const schemas = Object.values(structure.root.schemas), tables = schemas.flatMap(s => Object.values(s.tables));
            const delta = diff(structure, examples[key].expected);
            this.view.set('status', `${schemas.length} ${schemas.length === 1 ? 'schema' : 'schemi'} · ${tables.length} tabelle · ${tables.reduce((n, t) => n + Object.keys(t.columns).length, 0)} colonne fisiche · ${!delta.length ? 'JSON identico al riferimento Python dell’esempio' : `${delta.length} differenze rispetto al riferimento Python dell’esempio originale`}`);
            this.view.set('statusClass', delta.length ? 'changed' : '');
            this.view.set('noDifferences', !delta.length);
            this.view.set('differences', delta.slice(0, 20).join('\n\n') + (delta.length > 20 ? `\n\n… altre ${delta.length - 20} differenze` : ''));
            this.view.set('noJSON', false);
        } catch (error) {
            this.view.set('json', ''); this.showOutput();
            this.view.set('modelJSON', ''); this.view.set('modelStatus', 'Modello non valido');
            this.view.set('status', error.message); this.view.set('statusClass', 'error');
            this.view.set('noDifferences', true); this.view.set('noJSON', true);
        }
    }
    download() {
        if (this.view.get('noJSON')) return;
        // GC-095 §095 inout.download exports a Bag; this is the migration's plain
        // JSON contract, kept verbatim rather than round-tripped through a Bag.
        const url = URL.createObjectURL(new Blob([this.view.get('json') + '\n'], {type: 'application/json'}));
        const link = document.createElement('a');
        link.href = url; link.download = 'migration.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    database(node, {command}) { return this.db.run(command); }
    selectQuery() { this.queries.load(); }
    editQuery() {
        this.view.set('queryStatus', 'Richiesta modificata: ricompila per confrontare il SQL.');
    }
    compileQuery() { this.queries.preview(); }
    executeQuery() { return this.queries.execute(false); }
    selectImportFile(node, event) {
        this.selectedImportFile = event.target.files?.[0] ?? null;
        this.view.set('importFileName', this.selectedImportFile?.name ?? 'Nessun file selezionato');
    }
    importFile() { return this.queries.importFile(this.selectedImportFile); }
    selectTransferFile(node, event) {
        this.selectedTransferFile = event.target.files?.[0] ?? null;
        this.view.set('transferFileName', this.selectedTransferFile?.name ?? 'Nessun file selezionato');
    }
    editTransfer() { return this.transfers.edit(); }
    resumeTransfer() { return this.transfers.resume(); }
    checkTransfers() { return this.transfers.check(); }
    downloadBinaryTransferExample() { return this.transfers.binaryExample(); }
    downloadTransferExample() { return this.transfers.example(); }
    loadTransfer() { return this.transfers.load(this.selectedTransferFile); }
    downloadTransfer() { return this.transfers.download(); }
    checkImports() { return this.queries.checkImports(); }
    checkQueries() { return this.queries.execute(true); }
    checkCascades() { return this.queries.checkCascades(); }
    checkBehaviors() { return this.queries.checkBehaviors(); }
    checkHooks() { return this.queries.checkHooks(); }
}
