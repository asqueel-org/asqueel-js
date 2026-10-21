import oracle from '../test/fixtures/transfers.json' with {type:'json'};
const download = (bundle, name) => {
    const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)+'\n'],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=name;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
};
export function transferPanel(view, database) {
    const run = async callback => {
        if(view.get('busy')) return;
        view.set('busy',true);view.set('transferStatus','Trasferimento e verifica SQLite in corso…');
        try { await callback(); }
        catch(error) {view.set('transferStatus',error.message);}
        finally {view.set('busy',false);}
    };
    return {
        check: () => run(async () => {
            const result=await database.request('transfer-checks');
            view.set('transferChecks',result.checks.map(s=>'✓ '+s).join('\n'));
            view.set('transferSample',JSON.stringify(result.sample,null,2));
            view.set('transferBinarySample',JSON.stringify(result.binarySample,null,2));
            view.set('transferStatus',`${result.checks.length} trasferimenti identici al riferimento Python; modifiche offline e riapertura IndexedDB verificate.`);
        }),
        binaryExample: () => download(oracle.find(e=>e.name==='bags_blobs').bundle,'python-bag-blob.json'),
        example: () => download(oracle.find(e=>e.name==='tables').bundle,'python-snapshot.json'),
        load: file => run(async () => {
            if(!file) throw new Error('Seleziona uno snapshot JSON esportato da Python');
            const result=await database.request('transfer-load',{file});
            view.set('transferSample',JSON.stringify(result,null,2));
            view.set('transferStatus',`Snapshot caricato in IndexedDB: ${Object.entries(result.counts).map(([name,count])=>name+': '+count+' record').join(', ')}.`);
        }),
        download: () => run(async () => {
            download(await database.request('transfer-export'),'browser-snapshot.json');
            view.set('transferStatus','Snapshot TYTX esportato per Python.');
        }),
    };
}
