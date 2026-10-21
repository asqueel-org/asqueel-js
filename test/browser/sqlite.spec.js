import periodOracle from '../fixtures/periods.json' with {type: 'json'};
import {queryPeriods} from '../../examples/query-periods.js';
import {test, expect} from '@playwright/test';
import compositionCases from '../fixtures/resolved-model.json' with {type:'json'};
import examples from '../fixtures/model-examples.json' with {type:'json'};
import cascadesOracle from '../fixtures/cascades.json' with {type: 'json'};
import behaviorsOracle from '../fixtures/behaviors.json' with {type: 'json'};
import hooksOracle from '../fixtures/hooks.json' with {type: 'json'};

test('sys_fields and hooks execute like Python, roll back and survive IndexedDB reopening', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await leaf(page, 'queries');
    await ready(page, 'queries');
    await page.getByRole('button', {name: 'Verifica sys_fields e hook', exact: true}).click();
    await expect(page.locator('#query-status')).toContainText(`${hooksOracle.cases.length} cicli sys_fields e hook identici a Python`, {timeout: 90000});
    await expect(page.locator('#hooks-checks')).toContainText('caught_hook_failure_still_rolls_back');
    const actual = JSON.parse(await page.locator('#hooks-sample').textContent());
    expect(actual).toEqual(hooksOracle.cases.find(c => c.name === 'insert_order_and_nested_audit').expected);
    await page.getByText('Esempio verificato: record, eventi e scritture degli hook', {exact: true}).click();
    await page.locator('#hooks-sample').scrollIntoViewIfNeeded();
    await page.screenshot({path: 'output/gramlot-hooks.png'});
    expect(errors).toEqual([]);
});

// Real worker, WASM and IndexedDB. No fake adapter or intercepted SQLite calls.
for (const [command, expected] of [['checks', 7], ['query-checks', 27], ['composition-checks', compositionCases.length + 3]]) {
    test(`browser SQLite: ${command}`, async ({page}) => {
        await leaf(page);
        const checks = await page.evaluate(type => new Promise((resolve, reject) => {
            const worker = new Worker('/dist/sqlite-worker.js', {type: 'module'});
            worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
            worker.onmessage = ({data}) => {
                worker.terminate();
                if (data.error) reject(new Error(data.error));
                else resolve(data.result);
            };
            worker.postMessage({id: 1, type});
        }), command);
        expect(checks).toHaveLength(expected);
    });
}

test('playground exposes the Python composition checks', async ({page}) => {
    await leaf(page);
    await page.getByRole('button', {name: 'Verifica composizione con Python'}).click();
    await expect(page.locator('#db-status')).toContainText('verifiche browser superate');
    await expect(page.locator('#db-checks-result')).toContainText('Modello composto migrato su WASM/IndexedDB');
    await expect(page.locator('#db-checks-result')).toContainText('Colgroups e formule: modello Python');
    await expect(page.locator('#db-checks-result')).toContainText('VirtualRelation: modello Python');
});

test('virtual relation example renders the exact Python migration JSON', async ({page}) => {
    await leaf(page);
    await page.locator('#example').selectOption('virtual-relations');
    await expect(page.locator('#status')).toContainText('JSON identico al riferimento Python');
    await expect(page.locator('#status')).toContainText('2 tabelle');
    const expected = examples['virtual-relations'].migration;
    expect(JSON.parse(await page.locator('#result').textContent())).toEqual(expected);
});

test('group/formula example renders the exact Python migration JSON', async ({page}) => {
    await leaf(page);
    await page.locator('#example').selectOption('groups');
    await expect(page.locator('#status')).toContainText('JSON identico al riferimento Python');
    await expect(page.locator('#status')).toContainText('3 colonne fisiche');
    const expected = examples.groups.migration;
    expect(JSON.parse(await page.locator('#result').textContent())).toEqual(expected);
});

test('browser exposes and compares the complete hierarchical model',async({page})=>{
    await leaf(page);await page.locator('#example').selectOption('application');
    await expect(page.locator('#model-status')).toHaveText('Modello completo identico a Python 0.6.1');
    expect(JSON.parse(await page.locator('#resolved-model').textContent())).toEqual(examples.application.model);
    await page.screenshot({path: 'output/gramlot-model.png'});
});

async function leaf(page, section = 'models') {
    await page.goto(`/?page=${section}&embedded=1`);
}

async function ready(page, section) {
    await expect(page.locator('[data-gramlot-page]')).toHaveAttribute('data-gramlot-page', section);
    await expect(page.locator('#db-status')).toContainText('SQLite aperto');
    await expect(page.locator('#example')).toBeEnabled();
    expect(await page.evaluate(() => window.gramlot.data.getItem('section'))).toBe(section);
}

test('Gramlot pages preserve an edited model across navigation and export its migration', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await leaf(page, 'models');
    await ready(page, 'models');
    const source = "root.db({name: 'draft', implementation: 'sqlite'}).packages().package('app').table({name: 'item', pkey: 'id'}).column({name: 'id', dtype: 'I'});";
    await page.locator('#model').getByRole('textbox').fill(source);
    await expect(page.locator('#download').getByRole('button')).toBeDisabled();
    await page.locator('#render').click();
    await expect(page.locator('#status')).toContainText('1 tabelle');
    const expected = JSON.parse(await page.locator('#result').textContent());
    expect(expected.root.entity_name).toBe('draft');
    const downloading = page.waitForEvent('download');
    await page.locator('#download').click();
    const downloaded = await downloading;
    expect(downloaded.suggestedFilename()).toBe('migration.json');
    const {readFile} = await import('node:fs/promises');
    expect(JSON.parse(await readFile(await downloaded.path(), 'utf8'))).toEqual(expected);
    await leaf(page, 'sqlite');
    await ready(page, 'sqlite');
    await page.getByRole('button', {name: 'Calcola piano SQL'}).click();
    await expect(page.locator('#sql-plan')).toContainText('app_item');
    await leaf(page, 'models');
    await ready(page, 'models');
    await expect(page.locator('#model').getByRole('textbox')).toHaveText(source);
    expect(JSON.parse(await page.locator('#result').textContent())).toEqual(expected);
    await page.locator('#model').getByRole('textbox').fill('not valid JavaScript {');
    await page.locator('#render').click();
    await expect(page.locator('#status')).toHaveClass('error');
    await expect(page.locator('#download').getByRole('button')).toBeDisabled();
    await expect(page.locator('#resolved-model')).toBeEmpty();
    await page.locator('#restore').click();
    await expect(page.locator('#status')).toContainText('JSON identico');
    expect(errors).toEqual([]);
});

test('Gramlot query actions persist real data across pages and reload', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await leaf(page, 'queries');
    await ready(page, 'queries');
    await page.getByRole('button', {name: 'Applica migrazione'}).click();
    await expect(page.locator('#db-status')).toContainText('commit completato');
    await page.locator('#query-run').click();
    await expect(page.locator('#query-status')).toContainText('INSERT completato e salvato');
    await page.locator('#query-example').selectOption('people');
    await page.locator('#query-run').click();
    await expect(page.locator('#query-status')).toContainText('1 righe lette');
    const records = JSON.parse(await page.locator('#query-rows').textContent());
    expect(records).toHaveLength(1);
    await leaf(page, 'sqlite');
    await ready(page, 'sqlite');
    await expect(page.locator('#db-rows')).toContainText('query_people: 1 riga');
    await leaf(page, 'queries');
    await ready(page, 'queries');
    await page.reload();
    await ready(page, 'queries');
    await page.locator('#query-example').selectOption('people');
    await page.locator('#query-run').click();
    await expect(page.locator('#query-status')).toContainText('1 righe lette');
    expect(JSON.parse(await page.locator('#query-rows').textContent())).toEqual(records);
    await page.locator('#query-test').click();
    await expect(page.locator('#query-status')).toContainText('350 query confrontate con Python', {timeout: 30000});
    await expect(page.locator('#query-checks')).toContainText('var_*, #THIS, #ENV, chiavi composte');
    await expect(page.locator('#query-checks')).toContainText('tutte le letture calcolate e le chiavi composte identiche a Python');
    await expect(page.locator('#query-checks')).toContainText('48 sottoquery/aggregazioni');
    await expect(page.locator('#query-checks')).toContainText('17 query rifiutate');
    await expect(page.locator('#query-checks')).toContainText('sottoquery e aggregazioni ancora identiche a Python');
    await expect(page.locator('#query-checks')).toContainText('33 casi callback');
    await expect(page.locator('#query-checks')).toContainText('23 callback non valide');
    await expect(page.locator('#query-checks')).toContainText('callback dinamiche ancora identiche a Python');
    await expect(page.locator('#query-checks')).toContainText('46 casi #TEMPLATE/#IN_RANGE');
    await expect(page.locator('#query-checks')).toContainText('18 macro non valide');
    await expect(page.locator('#query-checks')).toContainText('#TEMPLATE e #IN_RANGE ancora identiche a Python');
    await expect(page.locator('#query-checks')).toContainText('131 casi #PERIOD');
    await expect(page.locator('#query-checks')).toContainText('27 periodi non validi');
    await expect(page.locator('#query-checks')).toContainText('#PERIOD ancora identico a Python');
    await page.getByText('Verifiche query nel browser', {exact: true}).click();
    await page.locator('#query-checks').scrollIntoViewIfNeeded();
    await page.locator('#query-checks').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.screenshot({path: 'output/gramlot-period.png'});
    expect(errors).toEqual([]);
});

test('Gramlot model page fits a phone viewport', async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await leaf(page, 'models');
    await ready(page, 'models');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({path: 'output/gramlot-mobile.png'});
});

test('CodeMirror binds edits, undo and JSON queries without external assets', async ({page}) => {
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
        if (new URL(request.url()).origin !== 'http://127.0.0.1:8093') external.push(request.url());
    });
    await leaf(page, 'models');
    await ready(page, 'models');
    const editor = page.locator('#model').getByRole('textbox');
    await expect(page.locator('#model .cm-lineNumbers')).toBeVisible();
    const original = await page.evaluate(() => window.gramlot.data.getItem('source'));
    await editor.fill('// Modello modificato\n' + original);
    await expect.poll(() => page.evaluate(() => window.gramlot.data.getItem('source'))).toBe('// Modello modificato\n' + original);
    await editor.press('ControlOrMeta+z');
    await expect.poll(() => page.evaluate(() => window.gramlot.data.getItem('source'))).toBe(original);
    await editor.press('ControlOrMeta+Shift+z');
    await expect.poll(() => page.evaluate(() => window.gramlot.data.getItem('source'))).toBe('// Modello modificato\n' + original);
    // The same busy Data used by SQLite commands makes the real editor non-editable.
    await page.evaluate(() => window.gramlot.data.setItem('busy', true));
    await expect(editor).toHaveAttribute('contenteditable', 'false');
    await page.evaluate(() => window.gramlot.data.setItem('busy', false));
    await expect(editor).toHaveAttribute('contenteditable', 'true');
    await leaf(page, 'queries');
    await ready(page, 'queries');
    const request = JSON.parse(await page.evaluate(() => window.gramlot.data.getItem('queryInput')));
    request.values.id = 99;
    await page.locator('#query-input').getByRole('textbox').fill(JSON.stringify(request, null, 2));
    await page.getByRole('button', {name: 'Compila query', exact: true}).click();
    await expect(page.locator('#query-params')).toContainText('99');
    await page.screenshot({path: 'output/gramlot-queries.png'});
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
});

test('hierarchies and counters match Python on real browser SQLite and reopen IndexedDB', async ({page}) => {
    test.setTimeout(180000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await leaf(page, 'queries');
    await ready(page, 'queries');
    await page.getByRole('button', {name: 'Verifica gerarchie e contatori', exact: true}).click();
    await expect(page.locator('#query-status')).toContainText(`${behaviorsOracle.cases.length} cicli gerarchie e contatori identici a Python`, {timeout: 150000});
    await expect(page.locator('#behaviors-checks')).toContainText('relative_index_rollback');
    expect(JSON.parse(await page.locator('#behaviors-sample').textContent())).toEqual(
        behaviorsOracle.cases.find(c => c.name === 'move_subtree_last_sibling').expected);
    await page.getByText('Spostamento verificato: sottoalbero, posizioni e SQL', {exact: true}).click();
    await page.locator('#behaviors-sample').scrollIntoViewIfNeeded();
    await page.screenshot({path: 'output/gramlot-behaviors.png'});
    expect(errors).toEqual([]);
});

test('application onUpdate cascades match Python in browser SQLite with rollback and reopening', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await leaf(page, 'queries');
    await ready(page, 'queries');
    await page.getByRole('button', {name: 'Verifica cascade onUpdate', exact: true}).click();
    await expect(page.locator('#query-status')).toContainText(`${cascadesOracle.cases.length} cicli cascade onUpdate identici a Python`, {timeout: 90000});
    await expect(page.locator('#cascades-checks')).toContainText('leaf_hook_failure_rollback');
    expect(JSON.parse(await page.locator('#cascades-sample').textContent())).toEqual(
        cascadesOracle.cases.find(c => c.name === 'cascade_chain_and_hooks').expected);
    await page.getByText('Cascade verificata: figli, hook e SQL', {exact: true}).click();
    await page.locator('#cascades-sample').scrollIntoViewIfNeeded();
    await page.screenshot({path: 'output/gramlot-cascades.png'});
    expect(errors).toEqual([]);
});


test('Gramlot PERIOD query preview and ordinary worker execution use the same date parser', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await leaf(page, 'models');
    await ready(page, 'models');
    await page.locator('#model').getByRole('textbox').fill(`(${queryPeriods.toString()})(root);`);
    await page.locator('#render').click();
    await expect(page.locator('#status')).toContainText('2 tabelle');
    await leaf(page, 'queries');
    await ready(page, 'queries');
    await page.getByRole('button', {name: 'Applica migrazione'}).click();
    await expect(page.locator('#db-status')).toContainText('commit completato');
    const query = periodOracle.cases.find(c => c.request.sqlparams?.period === 'oggi');
    const event = periodOracle.cases.find(c => c.request.operation === 'insert' && c.request.values.issued === '2026-10-21');
    const owner = periodOracle.cases.find(c => c.request.table === 'period.owner' && c.request.values?.id === event.request.values.owner_id);
    for (const c of [owner, event, query]) {
        await page.locator('#query-input').getByRole('textbox').fill(JSON.stringify(c.request, null, 2));
        await page.locator('#query-compile').click();
        expect(await page.locator('#query-sql').textContent()).toBe(c.compiled.sql);
        expect(JSON.parse(await page.locator('#query-params').textContent())).toEqual(c.compiled.params);
        await page.locator('#query-run').click();
        await expect.poll(async () => page.locator('#query-rows').textContent()).toBe(JSON.stringify(c.rows, null, 2));
    }
    await page.screenshot({path: 'output/gramlot-period-query.png'});
    expect(errors).toEqual([]);
});

for (const [format, content] of [
    ['csv', 'id,name,active\n81,"Tea, green",yes\n'],
    ['json', '[{"id":81,"name":"Tea, green","active":true}]'],
    ['tytx', '{"id":81,"name":"Tea, green","active":true}::JS\n'],
]) test(`Gramlot imports a local ${format} file in the SQLite worker and persists it`, async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await leaf(page, 'queries'); await ready(page, 'queries');
    await page.getByRole('button', {name: 'Applica migrazione'}).click();
    await expect(page.locator('#db-status')).toContainText('commit completato');
    await page.locator('#import-file').setInputFiles({name: `records.${format}`, mimeType: 'text/plain', buffer: Buffer.from(content)});
    await expect(page.locator('#import-file-name')).toHaveText(`records.${format}`);
    await page.locator('#import-run').click();
    await expect(page.locator('#import-status')).toContainText('1 record importati e salvati');
    await page.reload(); await ready(page, 'queries');
    await page.locator('#query-example').selectOption('people');
    await page.locator('#query-run').click();
    await expect(page.locator('#query-status')).toContainText('1 righe lette');
    const rows = JSON.parse(await page.locator('#query-rows').textContent());
    expect(rows[0].id).toBe(81); expect(rows[0].name).toBe('Tea, green');
    expect(errors).toEqual([]);
});

test('Gramlot compares imports with Python, including rollback and IndexedDB reopening', async ({page}) => {
    await leaf(page, 'queries'); await ready(page, 'queries');
    await page.locator('#import-test').click();
    await expect(page.locator('#import-status')).toContainText('49 import identici a Python', {timeout: 90000});
    await expect(page.locator('#import-checks')).toContainText('rollback_after_block');
    await page.getByText('Verifiche import nel browser', {exact:true}).click();
    await page.locator('#import-checks').scrollIntoViewIfNeeded();
    await page.screenshot({path:'output/gramlot-imports.png'});
});
