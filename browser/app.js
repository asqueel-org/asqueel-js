import {defineModel} from '../src/index.js';
import {shop} from '../examples/shop.js';
import {application} from '../examples/application.js';
import shopExpected from '../test/fixtures/shop.json' with {type: 'json'};
import applicationExpected from '../test/fixtures/application.json' with {type: 'json'};
import {browserSqlite, browserSqliteV2} from '../examples/browser-sqlite.js';
import sqliteExpected from '../test/fixtures/sqlite.json' with {type: 'json'};
import {sqlitePanel} from './sqlite-panel.js';
import {queryPanel} from './query-panel.js';
import {browserQueries} from '../examples/browser-queries.js';
import queriesExpected from '../test/fixtures/queries.json' with {type: 'json'};
import {groupedItems} from '../examples/groups.js';
import compositionExpected from '../test/fixtures/composition.json' with {type: 'json'};

const editor = document.querySelector('#model');
const result = document.querySelector('#result');
const status = document.querySelector('#status');
const download = document.querySelector('#download');
const example = document.querySelector('#example');
const output = document.querySelector('#output');
const comparison = document.querySelector('#comparison');
const differences = document.querySelector('#differences');
const examples = {
    groups: {recipe: groupedItems, expected: compositionExpected.find(c => c.name === 'colgroup_and_subtable_together').expected.migration},
    queries: {recipe: browserQueries, expected: queriesExpected.desired},
    sqlite: {recipe: browserSqlite, expected: sqliteExpected.v1.desired},
    'sqlite-v2': {recipe: browserSqliteV2, expected: sqliteExpected.v2.desired},
    application: {recipe: application, expected: applicationExpected},
    shop: {recipe: shop, expected: shopExpected},
};
let json = null;
let databasePanel;
let queriesPanel;
const canonical = value => value && typeof value === 'object'
    ? Array.isArray(value) ? value.map(canonical)
        : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value;

function diff(a, b, path = '$') {
    if (JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))) return [];
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
        return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
            .flatMap(key => diff(a[key], b[key], `${path}.${key}`));
    }
    const value = v => v === undefined ? '(assente)' : JSON.stringify(v);
    return [`${path}\n  JavaScript: ${value(a)}\n  Python:     ${value(b)}`];
}

function showOutput() {
    result.textContent = output.value === 'python'
        ? JSON.stringify(examples[example.value].expected, null, 2) : json || '';
}

function render() {
    try {
        // The local recipe is application code, equivalent to editing the example.
        const model = defineModel(new Function('root', editor.value));
        const structure = model.toMigration();
        json = JSON.stringify(structure, null, 2);
        showOutput();
        const schemas = Object.values(structure.root.schemas);
        const tables = schemas.flatMap(s => Object.values(s.tables));
        const delta = diff(structure, examples[example.value].expected);
        status.textContent = `${schemas.length} ${schemas.length === 1 ? 'schema' : 'schemi'} · ${tables.length} tabelle · ${
            tables.reduce((n, t) => n + Object.keys(t.columns).length, 0)} colonne fisiche · ${
            !delta.length ? 'JSON identico al riferimento Python dell’esempio' : `${delta.length} differenze rispetto al riferimento Python dell’esempio originale`}`;
        status.className = delta.length ? 'changed' : '';
        comparison.hidden = !delta.length;
        differences.textContent = delta.slice(0, 20).join('\n\n')
            + (delta.length > 20 ? `\n\n… altre ${delta.length - 20} differenze` : '');
        download.disabled = false;
    } catch (error) {
        json = null;
        showOutput();
        status.textContent = error.message;
        status.className = 'error';
        comparison.hidden = true;
        download.disabled = true;
    }
}
function loadExample() {
    const source = examples[example.value].recipe.toString();
    editor.value = source.slice(source.indexOf('{') + 1, source.lastIndexOf('}')).trim();
    output.value = 'javascript';
    try { localStorage.setItem('asqueel-example', example.value); } catch {}
    render();
    databasePanel?.invalidate();
    queriesPanel?.invalidate();
}
example.addEventListener('change', loadExample);
output.addEventListener('change', showOutput);
document.querySelector('#restore').addEventListener('click', loadExample);
document.querySelector('#render').addEventListener('click', render);
download.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([json + '\n'], {type: 'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'migration.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});
try {
    const selected = localStorage.getItem('asqueel-example');
    if (Object.hasOwn(examples, selected)) example.value = selected;
} catch {}
loadExample();
editor.addEventListener('input', () => { databasePanel?.invalidate(); queriesPanel?.invalidate(); });
databasePanel = sqlitePanel(() => {
    render();
    if (!json) throw new Error('Correggi il modello prima di migrare');
    return JSON.parse(json);
}, () => example.value);
queriesPanel = queryPanel(databasePanel, () => defineModel(new Function('root', editor.value)));
