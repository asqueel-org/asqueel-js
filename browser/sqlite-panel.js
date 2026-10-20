import oracle from '../test/fixtures/sqlite.json' with {type: 'json'};
import {equal} from '../src/sqlite.js';

export function sqlitePanel(getDesired, getExample) {
    const worker = new Worker(new URL('./sqlite-worker.js', import.meta.url), {type: 'module'});
    const pending = new Map();
    let sequence = 0, busy = false, available = true;
    const status = document.querySelector('#db-status'), plan = document.querySelector('#sql-plan');
    const actual = document.querySelector('#db-schema'), counts = document.querySelector('#db-rows');
    const checks = document.querySelector('#db-checks-result');
    const buttons = [...document.querySelectorAll('[data-db]')];
    const authoring = [...document.querySelectorAll('#example, #restore, #model, #render, #query-run, #query-test, #query-compile, #query-example, #query-input')];
    const request = (type, desired) => new Promise((resolve, reject) => {
        if (!available) { reject(new Error('Worker SQLite non disponibile: ricarica la pagina')); return; }
        const id = ++sequence;
        pending.set(id, {resolve, reject});
        worker.postMessage({id, type, desired});
    });
    worker.onmessage = ({data}) => {
        const entry = pending.get(data.id);
        if (!entry) return;
        pending.delete(data.id);
        if (data.error) entry.reject(new Error(data.error)); else entry.resolve(data.result);
    };
    worker.onerror = event => {
        available = false;
        for (const entry of pending.values()) entry.reject(new Error(event.message || 'Avvio del worker fallito'));
        pending.clear();
        status.textContent = 'SQLite non disponibile. ' + (event.message || '');
        status.className = 'error';
        buttons.forEach(b => { b.disabled = true; });
    };
    function showDatabase(result) {
        const structure = result.structure || result.current;
        if (!structure) return '';
        actual.textContent = JSON.stringify(structure, null, 2);
        if (result.rows) counts.textContent = result.rows.map(r => `${r.table}: ${r.rows} ${r.rows === 1 ? 'riga' : 'righe'}`).join(' · ') || 'Database vuoto';
        const version = getExample() === 'sqlite-v2' ? 'v2' : getExample() === 'sqlite' ? 'v1' : null;
        return version && equal(structure, oracle[version].actual)
            ? ' Catalogo letto identico al riferimento Python.' : '';
    }
    async function run(type) {
        if (busy) return;
        busy = true;
        buttons.forEach(b => { b.disabled = true; });
        authoring.forEach(b => { b.disabled = true; });
        status.className = '';
        status.textContent = type.endsWith('checks') ? 'Verifica in un database di test separato…' : 'Operazione SQLite in corso…';
        try {
            const desired = ['plan', 'apply'].includes(type) ? getDesired() : undefined;
            const result = await request(type, desired);
            if (type.endsWith('checks')) {
                checks.textContent = result.map(s => `✓ ${s}`).join('\n');
                status.textContent = `${result.length} verifiche browser superate · SQLite WASM + IndexedDB`;
            } else {
                const parity = showDatabase(result);
                if (type === 'plan') {
                    plan.textContent = [...result.statements, ...result.blocked.map(s => `BLOCCATO: ${s}`),
                        ...result.warnings.map(s => `NOTA: ${s}`)].join('\n\n') || 'Nessuna operazione: diff vuoto.';
                    status.textContent = result.blocked.length ? `${result.blocked.length} modifiche fuori perimetro: migrazione bloccata.`
                        : `${result.statements.length} istruzioni SQL da applicare.${parity}`;
                    status.className = result.blocked.length ? 'error' : '';
                } else if (type === 'apply') {
                    plan.textContent = result.executed.join('\n\n') || 'Nessuna operazione: database già allineato.';
                    if (result.warnings.length) plan.textContent += '\n\n' + result.warnings.join('\n');
                    status.textContent = `${result.executed.length} istruzioni applicate · commit completato · diff finale vuoto.${parity}`;
                } else status.textContent = `SQLite aperto · persistenza IndexedDB.${parity}`;
            }
        } catch (error) {
            status.textContent = error.message;
            status.className = 'error';
        } finally {
            busy = false;
            buttons.forEach(b => { b.disabled = !available; });
            authoring.forEach(b => { b.disabled = false; });
        }
    }
    buttons.forEach(button => button.addEventListener('click', () => run(button.dataset.db)));
    run('inspect');
    return {request, showDatabase, invalidate() {
        if (busy) return;
        status.textContent = 'Modello cambiato: ricalcola il piano rispetto al database.';
        status.className = '';
        plan.textContent = 'Piano da ricalcolare.';
    }};
}
