import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test, expect, chromium} from '@playwright/test';
import {mkdir, writeFile, readFile, mkdtemp, rm} from 'node:fs/promises';
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
    await expect(page.locator('#transfer-status')).toContainText(`${oracle.length} transfers identical`,{timeout:90000});
    await page.screenshot({path:'output/gramlot-transfers.png',fullPage:true});
});

test('Gramlot loads a Python snapshot and downloads its TYTX return', async ({page}) => {
    await page.goto('/?page=transfer&embedded=1');
    await page.waitForFunction(() => window.gramlot?.data.getItem('ready') === true);
    await expect(page.locator('#transfer-load')).toBeEnabled();
    await page.locator('#transfer-file').setInputFiles({name:'snapshot.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(oracle[1].bundle))});
    await page.locator('#transfer-load').click();
    await expect(page.locator('#transfer-status')).toContainText('Snapshot loaded into IndexedDB');
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
    const frame=page.frameLocator('iframe[title="Offline transfer"]');
    await expect(frame.locator('#transfer-test')).toBeVisible();
    await expect(frame.locator('#example')).toHaveCount(0);
    await expect(page.getByRole('treeitem',{name:'Offline transfer',exact:true})).toBeVisible();
});

test('Gramlot uploads Bag/blob snapshots and exports lossless TYTX values', async ({page, context}) => {
    const entry=oracle.find(e=>e.name==='bags_blobs');
    await page.goto('/?page=transfer&embedded=1');
    await page.waitForFunction(() => window.gramlot?.data.getItem('ready') === true);
    const examplePending=page.waitForEvent('download');
    await page.locator('#transfer-binary-example').click();
    const example=await examplePending;
    expect(JSON.parse(await readFile(await example.path(),'utf8'))).toEqual(entry.bundle);
    await page.locator('#transfer-file').setInputFiles({name:'bag-blob.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(entry.bundle))});
    await page.locator('#transfer-load').click();
    await expect(page.locator('#transfer-status')).toContainText('files.asset: 4 records');
    await expect(page.locator('#offline-status')).toContainText('App ready');
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#transfer-status')).toContainText('Workspace restored');
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

test('real offline cycle: load, CRUD, close/reopen app, export back to Python', async () => {
    const profile = await mkdtemp(join(tmpdir(),'asqueel-offline-'));
    let context = await chromium.launchPersistentContext(profile, {baseURL:'http://127.0.0.1:8093'});
    const page = context.pages()[0];
    try {
    const entry=oracle.find(e=>e.name==='tables');
    await page.goto('/?page=transfer&embedded=1');
    await page.waitForFunction(() => window.gramlot?.data.getItem('ready') === true);
    await expect(page.locator('#offline-status')).toContainText('App ready');
    await page.locator('#transfer-file').setInputFiles({name:'snapshot.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(entry.bundle))});
    await page.locator('#transfer-load').click();
    await expect(page.locator('#transfer-status')).toContainText('Snapshot loaded');
    const snapshot = target => target.evaluate(() => JSON.parse(window.gramlot.data.getItem('transferSample')));
    const compare = (actual, expected) => {
        for (const key of ['source','migration','structure','rows']) expect(actual[key]).toEqual(expected[key]);
    };
    compare(await snapshot(page),entry.before);
    await context.setOffline(true);
    await expect(page.locator('#connection-status')).toContainText('Offline');
    const execute = async request => {
        await page.evaluate(request => window.gramlot.data.setItem('transferRequest',JSON.stringify(request)), request);
        await page.locator('#transfer-edit').click();
        await expect(page.locator('#transfer-status')).toContainText(request.operation.toUpperCase()+' completed');
    };
    await execute({operation:'update',table:'work.document',values:{id:'d1',title:'Changed offline'}});
    await execute({operation:'insert',table:'work.line',values:{id:'l2',document_id:'d1',description:'Nuova riga offline',quantity:3}});
    await execute({operation:'insert',table:'work.line',values:{id:'temporary',document_id:'d1',description:'Da cancellare',quantity:1}});
    await execute({operation:'delete',table:'work.line',values:{id:'temporary'}});
    await execute({operation:'select',table:'work.document',columns:'$id,$title',order_by:'$id'});
    const edited = await snapshot(page);
    compare(edited,entry.after);
    expect(edited.records.find(r=>r.id==='d1').title).toBe('Changed offline');
    await page.close();
    await context.close();
    // A new Chromium process, same profile; networking is disabled before navigation.
    context = await chromium.launchPersistentContext(profile, {baseURL:'http://127.0.0.1:8093',offline:true});
    const reopened=context.pages()[0];
    expect(await reopened.evaluate(() => navigator.onLine)).toBe(false);
    // Open the real gallery shell too: both navigation and embedded Gramlot workers must boot offline.
    await reopened.goto('/?page=transfer');
    const frame=reopened.frameLocator('iframe[title="Offline transfer"]');
    await expect(frame.locator('#transfer-status')).toContainText('Workspace restored');
    const app=reopened.frames().find(f=>f.url().includes('embedded=1'));
    expect(await app.evaluate(() => navigator.onLine)).toBe(false);
    compare(await snapshot(app),entry.after);
    const pending=reopened.waitForEvent('download');
    await frame.locator('#transfer-export').click();
    const bundle=JSON.parse(await readFile(await (await pending).path(),'utf8'));
    expect(bundle.source).toBe(entry.bundle.source);
    await mkdir('output',{recursive:true});
    await writeFile('output/offline-transfer-returns.json',JSON.stringify([{name:entry.name,bundle}]));
    await reopened.screenshot({path:'output/gramlot-offline.png',fullPage:true});
    await reopened.close();
    } finally { await context.close(); await rm(profile,{recursive:true,force:true}); }
});


test('failed replacement preserves the previous offline workspace', async ({page}) => {
    await page.goto('/?page=transfer&embedded=1');
    await page.waitForFunction(() => window.gramlot?.data.getItem('ready') === true);
    const entry=oracle.find(e=>e.name==='tables');
    const load=async bundle => {
        await page.locator('#transfer-file').setInputFiles({name:'snapshot.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))});
        await page.locator('#transfer-load').click();
        await page.waitForFunction(() => !window.gramlot.data.getItem('busy'));
    };
    await load(entry.bundle);
    await expect(page.locator('#transfer-status')).toContainText('Snapshot loaded');
    const saved=await page.evaluate(() => JSON.parse(window.gramlot.data.getItem('transferSample')));
    const invalid=structuredClone(entry.bundle);
    // The first row is written before the duplicate primary key fails.
    invalid.data['work.line'] += invalid.data['work.line'];
    await load(invalid);
    await expect(page.locator('#transfer-status')).not.toContainText('Snapshot loaded');
    await page.reload();
    await expect(page.locator('#transfer-status')).toContainText('Workspace restored');
    const resumed=await page.evaluate(() => JSON.parse(window.gramlot.data.getItem('transferSample')));
    expect(resumed.databaseName).toBe(saved.databaseName);
    for (const key of ['source','migration','structure','rows']) expect(resumed[key]).toEqual(entry.before[key]);
});

test('SQLite worker starts only after the offline cache controls the page',async({page})=>{
    await page.addInitScript(()=>{
        let ready;
        Object.defineProperty(window,'offlineReady',{configurable:true,get:()=>ready,set:promise=>{
            ready=promise.then(()=>new Promise(resolve=>setTimeout(()=>{window.cacheReadyObserved=true;resolve();},150)));
        }});
        const NativeWorker=window.Worker;
        window.Worker=class extends NativeWorker {
            constructor(url,options){
                super(url,options);
                if(new URL(url,location.href).pathname.endsWith('/sqlite-worker.js'))
                    window.sqliteWorkerControlled=!!navigator.serviceWorker.controller&&window.cacheReadyObserved===true;
            }
        };
    });
    await page.goto('/?page=transfer&embedded=1');
    await page.waitForFunction(()=>window.gramlot?.data.getItem('ready')===true);
    expect(await page.evaluate(()=>window.sqliteWorkerControlled)).toBe(true);
});
