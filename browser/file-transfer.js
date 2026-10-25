import {Page as BasePage} from '@gramlot/gramlot/page';
import {workerSource} from './dist/file-transfer-assets.js';
import {transferPanel} from './transfer-panel.js';

export class Page extends BasePage {
    static title = 'Asqueel · standalone HTML';
    static css = ['/themes/gramlot-compact/theme.css'];
    main(root) {
        for (const [path,value] of Object.entries({busy:true, ready:false, transferStatus:'Starting the embedded SQLite…',
            transferSample:'', transferFileName:'No file selected',
            transferRequest:JSON.stringify({operation:'update',table:'work.document',values:{id:'d1',title:'Changed offline'}},null,2)}))
            root.dataSetter({destination_path:path,value});
        const body=root.main({class:'file-transfer'});
        body.h1('Asqueel · one HTML file');
        body.p('Gramlot and SQLite embedded. Open this file also without a network; model and data stay in the browser. Reopen the same file with the same profile.');
        const button=(label,func,id) => body.button(label,{id,disabled:'^busy'}).dataController({func});
        button('Download the Python sample','example','transfer-example');
        button('Download the Bag and blob sample','binaryExample','transfer-binary-example');
        body.html_label('Python snapshot (.json)',{for:'transfer-file'});
        body.input({id:'transfer-file',type:'file',accept:'.json',disabled:'^busy',connect_onchange:'window.gramlot.logic.selectFile(this, event)'});
        body.p('^transferFileName');
        button('Load into local SQLite','load','transfer-load');
        button('Reread the local workspace','resume','transfer-resume');
        button('Export the snapshot for Python','download','transfer-export');
        body.h2('Change through the model');
        body.html_label('JSON request: select, insert, update or delete',{for:'transfer-request'});
        body.textarea({id:'transfer-request',value:'^transferRequest',rows:12,disabled:'^busy'});
        button('Run on the local database','edit','transfer-edit');
        body.p('^transferStatus',{id:'transfer-status',role:'status'});
        const details=body.details({open:true});
        details.summary('Model, migration, SQLite structure, SQL and values');
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
        worker.onerror=event=>stop(event.message || 'SQLite worker not available');
        this.page.abort.signal.addEventListener('abort',()=>stop('Page closed'),{once:true});
        const database={request:(type,desired)=>new Promise((resolve,reject)=>{
            if (!available) {reject(new Error('SQLite worker not available'));return;}
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
        this.view.set('transferFileName',this.file?.name || 'No file selected');
    }
    example() {return this.transfers.example();}
    binaryExample() {return this.transfers.binaryExample();}
    load() {return this.transfers.load(this.file);}
    resume() {return this.transfers.resume();}
    download() {return this.transfers.download();}
    edit() {return this.transfers.edit();}
}
