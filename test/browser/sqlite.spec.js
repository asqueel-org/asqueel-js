import {test, expect} from '@playwright/test';

// Real worker, WASM and IndexedDB. No fake adapter or intercepted SQLite calls.
for (const [command, expected] of [['checks', 7], ['query-checks', 5]]) {
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
