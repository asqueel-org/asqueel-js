import oracle from '../test/fixtures/sqlite.json' with {type: 'json'};
import {equal} from '../src/sqlite.js';

// The service writes Gramlot Data; Page bindings own the DOM.
export function sqlitePanel(view, getDesired, getExample) {
    const worker = new Worker(new URL('./sqlite-worker.js', import.meta.url), {type: 'module'});
    const pending = new Map();
    let sequence = 0, available = true;
    const request = (type, desired) => new Promise((resolve, reject) => {
        if (!available) { reject(new Error('SQLite worker not available: reload the page')); return; }
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
        const message = event.message || 'Worker start failed';
        stop(message);
        view.set('dbStatus', `SQLite not available. ${message}`);
        view.set('dbClass', 'error');
    };
    function showDatabase(result) {
        const structure = result.structure || result.current;
        if (!structure) return '';
        view.set('dbSchema', JSON.stringify(structure, null, 2));
        if (result.rows) view.set('dbRows', result.rows.map(r => `${r.table}: ${r.rows} ${r.rows === 1 ? 'row' : 'rows'}`).join(' · ') || 'Empty database');
        const version = getExample() === 'sqlite-v2' ? 'v2' : getExample() === 'sqlite' ? 'v1' : null;
        return version && equal(structure, oracle[version].actual) ? ' Catalog read back identical to the Python reference.' : '';
    }
    async function run(type) {
        if (view.get('busy')) return;
        view.set('busy', true);
        view.set('dbClass', '');
        view.set('dbStatus', type.endsWith('checks') ? 'Checking in a separate test database…' : 'SQLite operation in progress…');
        try {
            const result = await request(type, ['plan', 'apply'].includes(type) ? getDesired() : undefined);
            if (type.endsWith('checks')) {
                view.set('dbChecks', result.map(s => `✓ ${s}`).join('\n'));
                view.set('dbStatus', `${result.length} browser checks passed · SQLite WASM + IndexedDB`);
            } else {
                const parity = showDatabase(result);
                if (type === 'plan') {
                    view.set('sqlPlan', [...result.statements, ...result.blocked.map(s => `BLOCKED: ${s}`),
                        ...result.warnings.map(s => `NOTE: ${s}`)].join('\n\n') || 'No operation: empty diff.');
                    view.set('dbStatus', result.blocked.length ? `${result.blocked.length} unsupported changes: migration blocked.`
                        : `${result.statements.length} SQL statements to apply.${parity}`);
                    view.set('dbClass', result.blocked.length ? 'error' : '');
                } else if (type === 'apply') {
                    view.set('sqlPlan', (result.executed.join('\n\n') || 'No operation: database already aligned.')
                        + (result.warnings.length ? '\n\n' + result.warnings.join('\n') : ''));
                    view.set('dbStatus', `${result.executed.length} statements applied · commit completed · empty final diff.${parity}`);
                } else view.set('dbStatus', `SQLite open · IndexedDB persistence.${parity}`);
            }
        } catch (error) {
            view.set('dbStatus', error.message); view.set('dbClass', 'error');
        } finally { view.set('busy', false); }
    }
    return {request, run, showDatabase, dispose() { stop('Page closed'); }, invalidate() {
        if (view.get('busy')) return;
        view.set('dbStatus', 'Model changed: recompute the plan against the database.');
        view.set('dbClass', ''); view.set('sqlPlan', 'Plan to recompute.');
    }};
}
