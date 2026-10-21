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

test('Gramlot uploads Bag/blob snapshots and exports lossless TYTX values', async ({page}) => {
    const entry=oracle.find(e=>e.name==='bags_blobs');
    await page.goto('/?page=transfer&embedded=1');
    await page.waitForFunction(() => window.gramlot?.data.getItem('ready') === true);
    const examplePending=page.waitForEvent('download');
    await page.locator('#transfer-binary-example').click();
    const example=await examplePending;
    expect(JSON.parse(await readFile(await example.path(),'utf8'))).toEqual(entry.bundle);
    await page.locator('#transfer-file').setInputFiles({name:'bag-blob.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(entry.bundle))});
    await page.locator('#transfer-load').click();
    await expect(page.locator('#transfer-status')).toContainText('files.asset: 4 record');
    const pending=page.waitForEvent('download');await page.locator('#transfer-export').click();
    const returned=JSON.parse(await readFile(await (await pending).path(),'utf8'));
    const rows=returned.data['files.asset'].trim().split('\n').map(line=>JSON.parse(line.slice(0,-4)));
    const row=id=>rows.find(r=>r.id===id+'::T');
    expect(row('rich').payload).toBe(JSON.parse(entry.bundle.data['files.asset'].split('\n')[0].slice(0,-4)).payload);
    expect(row('rich').binary).toBe(Buffer.from(Array.from({length:256},(_,i)=>i)).toString('base64')+'::RAW');
    expect(row('empty').binary).toBe('::RAW');
    expect(row('null').binary).toBeNull();
    expect(row('empty').payload).toContain('"rows":[]');
    expect(row('null').payload).toBeNull();
});
