import {test, expect} from '@playwright/test';
import compositionCases from '../fixtures/resolved-model.json' with {type:'json'};
import examples from '../fixtures/model-examples.json' with {type:'json'};

// Real worker, WASM and IndexedDB. No fake adapter or intercepted SQLite calls.
for (const [command, expected] of [['checks', 7], ['query-checks', 5], ['composition-checks', compositionCases.length + 3]]) {
    test(`browser SQLite: ${command}`, async ({page}) => {
        await page.goto('/');
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
    await page.goto('/');
    await page.getByRole('button', {name: 'Verifica composizione con Python'}).click();
    await expect(page.locator('#db-status')).toContainText('verifiche browser superate');
    await expect(page.locator('#db-checks-result')).toContainText('Modello composto migrato su WASM/IndexedDB');
    await expect(page.locator('#db-checks-result')).toContainText('Colgroups e formule: modello Python');
    await expect(page.locator('#db-checks-result')).toContainText('VirtualRelation: modello Python');
});

test('virtual relation example renders the exact Python migration JSON', async ({page}) => {
    await page.goto('/');
    await page.locator('#example').selectOption('virtual-relations');
    await expect(page.locator('#status')).toContainText('JSON identico al riferimento Python');
    await expect(page.locator('#status')).toContainText('2 tabelle');
    const expected = examples['virtual-relations'].migration;
    expect(JSON.parse(await page.locator('#result').textContent())).toEqual(expected);
});

test('group/formula example renders the exact Python migration JSON', async ({page}) => {
    await page.goto('/');
    await page.locator('#example').selectOption('groups');
    await expect(page.locator('#status')).toContainText('JSON identico al riferimento Python');
    await expect(page.locator('#status')).toContainText('3 colonne fisiche');
    const expected = examples.groups.migration;
    expect(JSON.parse(await page.locator('#result').textContent())).toEqual(expected);
});

test('browser exposes and compares the complete hierarchical model',async({page})=>{
    await page.goto('/');await page.locator('#example').selectOption('application');
    await expect(page.locator('#model-status')).toHaveText('Modello completo identico a Python 0.6.0');
    expect(JSON.parse(await page.locator('#resolved-model').textContent())).toEqual(examples.application.model);
});
