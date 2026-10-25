import {Page as BasePage} from '@gramlot/gramlot/page';
import {workerSource} from './dist/file-transfer-assets.js';
import {transferPanel} from './transfer-panel.js';

export class Page extends BasePage {
    static title = 'Asqueel · HTML autonomo';
    static css = ['/themes/gramlot-compact/theme.css'];
    main(root) {
        for (const [path,value] of Object.entries({busy:true, ready:false, transferStatus:'Avvio SQLite incorporato…',
            transferSample:'', transferFileName:'Nessun file selezionato',
            transferRequest:JSON.stringify({operation:'update',table:'work.document',values:{id:'d1',title:'Modificato offline'}},null,2)}))
            root.dataSetter({destination_path:path,value});
        const body=root.main({class:'file-transfer'});
        body.h1('Asqueel · un solo HTML');
        body.p('Gramlot e SQLite incorporati. Apri questo file anche senza rete; modello e dati restano nel browser. Riapri lo stesso file con lo stesso profilo.');
        const button=(label,func,id) => body.button(label,{id,disabled:'^busy'}).dataController({func});
        button('Scarica esempio Python','example','transfer-example');
        button('Scarica esempio Bag e blob','binaryExample','transfer-binary-example');
        body.html_label('Snapshot Python (.json)',{for:'transfer-file'});
        body.input({id:'transfer-file',type:'file',accept:'.json',disabled:'^busy',connect_onchange:'window.gramlot.logic.selectFile(this, event)'});
        body.p('^transferFileName');
        button('Carica in SQLite locale','load','transfer-load');
        button('Rileggi workspace locale','resume','transfer-resume');
        button('Esporta snapshot per Python','download','transfer-export');
        body.h2('Modifica tramite il modello');
        body.html_label('Richiesta JSON: select, insert, update o delete',{for:'transfer-request'});
        body.textarea({id:'transfer-request',value:'^transferRequest',rows:12,disabled:'^busy'});
        button('Esegui sul database locale','edit','transfer-edit');
        body.p('^transferStatus',{id:'transfer-status',role:'status'});
        const details=body.details({open:true});
        details.summary('Modello, migrate, struttura SQLite, SQL e valori');
        details.pre('^transferSample',{id:'transfer-sample'});
        body.dataController({func:'start',_onStart:true});
    }
}

export class Logic {
    async start(node) {
        this.view={get:key=>node.GET(key),set:(key,value)=>node.SET(key,value)};
        const url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));
        const worker=new Worker(url);
        const pending=new Map();
        let sequence=0, available=true;
        const stop=message=>{
            available=false;
            for (const task of pending.values()) task.reject(new Error(message));
            pending.clear(); worker.terminate(); URL.revokeObjectURL(url);
        };
        worker.onmessage=({data})=>{
            const task=pending.get(data.id);
            if (!task) return;
            pending.delete(data.id);
            data.error ? task.reject(new Error(data.error)) : task.resolve(data.result);
        };
        worker.onerror=event=>stop(event.message || 'Worker SQLite non disponibile');
        this.page.abort.signal.addEventListener('abort',()=>stop('Pagina chiusa'),{once:true});
        const database={request:(type,desired)=>new Promise((resolve,reject)=>{
            if (!available) {reject(new Error('Worker SQLite non disponibile'));return;}
            const id=++sequence;pending.set(id,{resolve,reject});
            // file: pages may share an origin: keep each pathname's workspace separate.
            worker.postMessage({id,type,desired,workspaceName:'asqueel-file-v1:'+location.pathname});
        })};
        this.transfers=transferPanel(this.view,database);
        this.view.set('busy',false);
        await this.transfers.resume();
        this.view.set('ready',true);
    }
    selectFile(node,event) {
        this.file=event.target.files?.[0];
        this.view.set('transferFileName',this.file?.name || 'Nessun file selezionato');
    }
    example() {return this.transfers.example();}
    binaryExample() {return this.transfers.binaryExample();}
    load() {return this.transfers.load(this.file);}
    resume() {return this.transfers.resume();}
    download() {return this.transfers.download();}
    edit() {return this.transfers.edit();}
}
