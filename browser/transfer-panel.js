import oracle from '../test/fixtures/transfers.json' with {type:'json'};
const download = (bundle, name) => {
    const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)+'\n'],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=name;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
};
export function transferPanel(view, database) {
    const run = async callback => {
        if(view.get('busy')) return;
        view.set('busy',true);view.set('transferStatus','Transfer and SQLite check in progress…');
        try { await callback(); }
        catch(error) {view.set('transferStatus',error.message);}
        finally {view.set('busy',false);}
    };
    const show = result => view.set('transferSample', JSON.stringify(result,null,2));
    return {
        resume: () => run(async () => {
            const result = await database.request('transfer-resume');
            if (result) { show(result); view.set('transferStatus','Workspace restored from IndexedDB: model and local data.'); }
            else view.set('transferStatus','Load a Python snapshot to start.');
        }),
        edit: () => run(async () => {
            const request = JSON.parse(view.get('transferRequest'));
            show(await database.request('transfer-edit', {request}));
            view.set('transferStatus', `${request.operation.toUpperCase()} completed in local SQLite and saved in IndexedDB.`);
        }),
        check: () => run(async () => {
            const result=await database.request('transfer-checks');
            view.set('transferChecks',result.checks.map(s=>'✓ '+s).join('\n'));
            view.set('transferSample',JSON.stringify(result.sample,null,2));
            view.set('transferBinarySample',JSON.stringify(result.binarySample,null,2));
            view.set('transferStatus',`${result.checks.length} transfers identical to the Python reference; offline changes and IndexedDB reopen verified.`);
        }),
        binaryExample: () => download(oracle.find(e=>e.name==='bags_blobs').bundle,'python-bag-blob.json'),
        example: () => download(oracle.find(e=>e.name==='tables').bundle,'python-snapshot.json'),
        load: file => run(async () => {
            if(!file) throw new Error('Select a JSON snapshot exported by Python');
            // Safari file: pages cannot reliably read a cloned File inside a Blob worker.
            const text=await file.text();
            const result=await database.request('transfer-load',{text});
            view.set('transferSample',JSON.stringify(result,null,2));
            view.set('transferStatus',`Snapshot loaded into IndexedDB: ${Object.entries(result.counts).map(([name,count])=>name+': '+count+' records').join(', ')}.`);
        }),
        download: () => run(async () => {
            download(await database.request('transfer-export'),'browser-snapshot.json');
            view.set('transferStatus','TYTX snapshot exported for Python.');
        }),
    };
}
