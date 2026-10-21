import oracle from '../test/fixtures/sqlite.json' with {type: 'json'};
import {equal} from '../src/sqlite.js';

// The service writes Gramlot Data; Page bindings own the DOM.
export function sqlitePanel(view, getDesired, getExample) {
    const worker = new Worker(new URL('./sqlite-worker.js', import.meta.url), {type: 'module'});
    const pending = new Map();
    let sequence = 0, available = true;
    const request = (type, desired) => new Promise((resolve, reject) => {
        if (!available) { reject(new Error('Worker SQLite non disponibile: ricarica la pagina')); return; }
        const id = ++sequence;
        pending.set(id, {resolve, reject});
        worker.postMessage({id, type, desired});
    });
    const stop = message => {
        available = false;
        for (const entry of pending.values()) entry.reject(new Error(message));
        pending.clear();
        worker.terminate();
    };
    worker.onmessage = ({data}) => {
        const entry = pending.get(data.id);
        if (!entry) return;
        pending.delete(data.id);
        if (data.error) entry.reject(new Error(data.error)); else entry.resolve(data.result);
    };
    worker.onerror = event => {
        const message = event.message || 'Avvio del worker fallito';
        stop(message);
        view.set('dbStatus', `SQLite non disponibile. ${message}`);
        view.set('dbClass', 'error');
    };
    function showDatabase(result) {
        const structure = result.structure || result.current;
        if (!structure) return '';
        view.set('dbSchema', JSON.stringify(structure, null, 2));
        if (result.rows) view.set('dbRows', result.rows.map(r => `${r.table}: ${r.rows} ${r.rows === 1 ? 'riga' : 'righe'}`).join(' · ') || 'Database vuoto');
        const version = getExample() === 'sqlite-v2' ? 'v2' : getExample() === 'sqlite' ? 'v1' : null;
        return version && equal(structure, oracle[version].actual) ? ' Catalogo letto identico al riferimento Python.' : '';
    }
    async function run(type) {
        if (view.get('busy')) return;
        view.set('busy', true);
        view.set('dbClass', '');
        view.set('dbStatus', type.endsWith('checks') ? 'Verifica in un database di test separato…' : 'Operazione SQLite in corso…');
        try {
            const result = await request(type, ['plan', 'apply'].includes(type) ? getDesired() : undefined);
            if (type.endsWith('checks')) {
                view.set('dbChecks', result.map(s => `✓ ${s}`).join('\n'));
                view.set('dbStatus', `${result.length} verifiche browser superate · SQLite WASM + IndexedDB`);
            } else {
                const parity = showDatabase(result);
                if (type === 'plan') {
                    view.set('sqlPlan', [...result.statements, ...result.blocked.map(s => `BLOCCATO: ${s}`),
                        ...result.warnings.map(s => `NOTA: ${s}`)].join('\n\n') || 'Nessuna operazione: diff vuoto.');
                    view.set('dbStatus', result.blocked.length ? `${result.blocked.length} modifiche fuori perimetro: migrazione bloccata.`
                        : `${result.statements.length} istruzioni SQL da applicare.${parity}`);
                    view.set('dbClass', result.blocked.length ? 'error' : '');
                } else if (type === 'apply') {
                    view.set('sqlPlan', (result.executed.join('\n\n') || 'Nessuna operazione: database già allineato.')
                        + (result.warnings.length ? '\n\n' + result.warnings.join('\n') : ''));
                    view.set('dbStatus', `${result.executed.length} istruzioni applicate · commit completato · diff finale vuoto.${parity}`);
                } else view.set('dbStatus', `SQLite aperto · persistenza IndexedDB.${parity}`);
            }
        } catch (error) {
            view.set('dbStatus', error.message); view.set('dbClass', 'error');
        } finally { view.set('busy', false); }
    }
    return {request, run, showDatabase, dispose() { stop('Pagina chiusa'); }, invalidate() {
        if (view.get('busy')) return;
        view.set('dbStatus', 'Modello cambiato: ricalcola il piano rispetto al database.');
        view.set('dbClass', ''); view.set('sqlPlan', 'Piano da ricalcolare.');
    }};
}
