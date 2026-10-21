import {test, expect} from '@playwright/test';
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import oracle from '../fixtures/transfers.json' with {type:'json'};

test('Python source and TYTX execute offline and return an actual browser snapshot', async ({page}) => {
    await page.goto('/?page=transfer&embedded=1');
    await page.waitForFunction(() => window.gramlot?.data.getItem('ready') === true);
    await expect(page.locator('#transfer-test')).toBeEnabled();
    const result = await page.evaluate(() => new Promise((resolve,reject) => {
        const worker=new Worker('/dist/sqlite-worker.js',{type:'module'});
        worker.onmessage=({data})=>{worker.terminate();data.error?reject(new Error(data.error)):resolve(data.result);};
        worker.onerror=event=>{worker.terminate();reject(new Error(event.message));};
        worker.postMessage({id:1,type:'transfer-checks'});
    }));
    expect(result.checks).toHaveLength(oracle.length);
    // Passed verbatim to the Python receiver by scripts/verify_transfers.py --browser.
    await mkdir('output',{recursive:true});
    await writeFile('output/browser-transfer-returns.json',JSON.stringify(result.returns));
    expect(result.sample).toEqual(oracle.find(e=>e.name==='tables').after);
    await page.locator('#transfer-test').click();
    await expect(page.locator('#transfer-status')).toContainText(`${oracle.length} trasferimenti identici`,{timeout:90000});
    await page.screenshot({path:'output/gramlot-transfers.png',fullPage:true});
});

test('Gramlot loads a Python snapshot and downloads its TYTX return', async ({page}) => {
    await page.goto('/?page=transfer&embedded=1');
    await page.waitForFunction(() => window.gramlot?.data.getItem('ready') === true);
    await expect(page.locator('#transfer-load')).toBeEnabled();
    await page.locator('#transfer-file').setInputFiles({name:'snapshot.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(oracle[1].bundle))});
    await page.locator('#transfer-load').click();
    await expect(page.locator('#transfer-status')).toContainText('Snapshot caricato in IndexedDB');
    const pending=page.waitForEvent('download');await page.locator('#transfer-export').click();
    const download=await pending;
    const bundle=JSON.parse(await readFile(await download.path(),'utf8'));
    expect(bundle.format).toBe('asqueel-transfer');
    expect(Object.keys(bundle.data).sort()).toEqual(['work.document','work.line']);
    expect(bundle.data['work.document']).toContain('2026-01-01::D::T');
    expect(bundle.data['work.document']).toContain('12:30:15.123456::H');
});

test('Gramlot navigation opens the offline transfer page', async ({page}) => {
    await page.goto('/?page=transfer');
    const frame=page.frameLocator('iframe[title="Trasferimento offline"]');
    await expect(frame.locator('#transfer-test')).toBeVisible();
    await expect(frame.locator('#example')).toHaveCount(0);
    await expect(page.getByRole('treeitem',{name:'Trasferimento offline',exact:true})).toBeVisible();
});
