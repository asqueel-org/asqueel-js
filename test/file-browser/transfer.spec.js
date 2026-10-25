import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,copyFile,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import oracle from '../fixtures/transfers.json' with {type:'json'};

const snapshot = page => page.evaluate(() => JSON.parse(window.gramlot.data.getItem('transferSample')));
const compare = (actual,expected) => {
    for (const key of ['model','migration','structure','rows']) expect(actual[key]).toEqual(expected[key]);
};
async function load(page, bundle) {
    await page.locator('#transfer-file').setInputFiles({name:'python.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))});
    await page.locator('#transfer-load').click();
    await expect(page.locator('#transfer-status')).toContainText('Snapshot loaded');
}
async function execute(page, request) {
    // Edit the real bound control, not a test-only command channel.
    await page.locator('#transfer-request').fill(JSON.stringify(request));
    await page.locator('#transfer-request').press('Tab');
    await page.locator('#transfer-edit').click();
    await expect(page.locator('#transfer-status')).toContainText(request.operation.toUpperCase()+' completed');
}
async function download(page) {
    const pending=page.waitForEvent('download');
    await page.locator('#transfer-export').click();
    return JSON.parse(await readFile(await (await pending).path(),'utf8'));
}

test('single Gramlot HTML: offline first launch, CRUD, browser restart and Python return',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'asqueel-one-html-'));
    const file=join(directory,'ordini.html'), profile=join(directory,'profile');
    // Only this file is copied: missing companion scripts/WASM must fail the test.
    await copyFile('output/asqueel-offline.html',file);
    const url=pathToFileURL(file).href, network=[], errors=[];
    const launch=async()=>{
        const context=await chromium.launchPersistentContext(profile,{offline:true});
        context.on('request',request=>{
            const address=request.url();
            if (address!==url && !/^(blob:|data:)/.test(address)) network.push(address);
        });
        const watch=page=>page.on('pageerror',error=>errors.push(error.message));
        context.on('page',watch);for (const page of context.pages()) watch(page);
        return context;
    };
    let context=await launch();
    try {
        const entry=oracle.find(e=>e.name==='tables');
        let page=context.pages()[0];
        await page.goto(url);
        await page.waitForFunction(()=>window.gramlot?.data.getItem('ready')===true);
        expect(await page.evaluate(()=>({online:navigator.onLine,protocol:location.protocol})))
            .toEqual({online:false,protocol:'file:'});
        await load(page,entry.bundle);
        compare(await snapshot(page),entry.before);
        await execute(page,{operation:'update',table:'work.document',values:{id:'d1',title:'Changed offline'}});
        await execute(page,{operation:'insert',table:'work.line',values:{id:'l2',document_id:'d1',description:'Nuova riga offline',quantity:3}});
        await execute(page,{operation:'insert',table:'work.line',values:{id:'temporary',document_id:'d1',quantity:1}});
        await execute(page,{operation:'delete',table:'work.line',values:{id:'temporary'}});
        await execute(page,{operation:'select',table:'work.document',columns:'$id,$title',order_by:'$id'});
        const result=await snapshot(page);
        compare(result,entry.after);
        expect(result.records.find(r=>r.id==='d1').title).toBe('Changed offline');
        await context.close();
        context=await launch();page=context.pages()[0];
        await page.goto(url);
        await expect(page.locator('#transfer-status')).toContainText('Workspace restored');
        compare(await snapshot(page),entry.after);
        const bundle=await download(page);
        await writeFile('output/file-transfer-returns.json',JSON.stringify([{name:entry.name,bundle}]));
        await page.screenshot({path:'output/gramlot-single-html.png',fullPage:true});
        expect(network).toEqual([]);
        expect(errors).toEqual([]);
        // Different HTML paths do not accidentally share the active workspace.
        const other=join(directory,'altro.html');await copyFile(file,other);
        await page.goto(pathToFileURL(other).href);
        await expect(page.locator('#transfer-status')).toContainText('Load a Python snapshot');
        await page.goto(url);
        await expect(page.locator('#transfer-status')).toContainText('Workspace restored');
        compare(await snapshot(page),entry.after);
    } finally {await context.close();await rm(directory,{recursive:true,force:true});}
});

test('single HTML preserves Bag/blob values after file reload without networking',async({browser})=>{
    const context=await browser.newContext({offline:true});
    try {
        const page=await context.newPage();
        await page.goto(pathToFileURL(join(process.cwd(),'output/asqueel-offline.html')).href);
        await page.waitForFunction(()=>window.gramlot?.data.getItem('ready')===true);
        const entry=oracle.find(e=>e.name==='bags_blobs');
        await load(page,entry.bundle);
        compare(await snapshot(page),entry.before);
        await page.reload();
        await expect(page.locator('#transfer-status')).toContainText('Workspace restored');
        compare(await snapshot(page),entry.before);
        const returned=await download(page);
        const rows=text=>text.trim().split('\n').map(line=>JSON.parse(line.slice(0,-4))).sort((a,b)=>a.id.localeCompare(b.id));
        expect(rows(returned.data['files.asset'])).toEqual(rows(entry.bundle.data['files.asset']));
    } finally {await context.close();}
});
