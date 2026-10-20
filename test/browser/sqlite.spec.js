import {test, expect} from '@playwright/test';
import compositionCases from '../fixtures/composition.json' with {type: 'json'};

// Real worker, WASM and IndexedDB. No fake adapter or intercepted SQLite calls.
for (const [command, expected] of [['checks', 7], ['query-checks', 5], ['composition-checks', compositionCases.length + 1]]) {
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
});
