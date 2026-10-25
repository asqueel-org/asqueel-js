import {PlaygroundPage, action, detail} from './base.js';
export class TransferPage extends PlaygroundPage {
    static section = 'transfer';
    static title = 'Asqueel JS · Offline transfer · Gramlot';
    content(root) {
        const section = root.main({class:'database single-panel'});
        section.h2('Python → browser → Python');
        const body = section.div({class:'db-content'});
        body.p('The recipe source rebuilds the model and the SQLite tables; the records travel in TYTX. Data selection and synchronization stay with the application.');
        body.p('^connectionStatus',{id:'connection-status',role:'status'});
        body.p('^offlineStatus',{id:'offline-status',role:'status'});
        const actions=body.div({class:'db-actions'});
        action(actions, 'Check transfers with Python', 'checkTransfers', {id:'transfer-test'});
        action(actions, 'Download the Python sample', 'downloadTransferExample', {id:'transfer-example'});
        action(actions, 'Download the Bag and blob sample', 'downloadBinaryTransferExample', {id:'transfer-binary-example'});
        body.html_label('Python snapshot (.json)', {for:'transfer-file'});
        body.input({id:'transfer-file',type:'file',accept:'.json',disabled:'^busy',connect_onchange:'playground.selectTransferFile'});
        body.p('^transferFileName');
        const load=body.div({class:'db-actions'});
        action(load,'Load into local SQLite','loadTransfer',{id:'transfer-load'});
        action(load,'Export the snapshot for Python','downloadTransfer',{id:'transfer-export'});
        action(load,'Reread the local workspace','resumeTransfer',{id:'transfer-resume'});
        body.h3('Change the records also without network');
        body.p('After “App ready” you can disconnect. Run select, insert, update or delete requests through the loaded model, then close and reopen this address: model and data are recovered from IndexedDB.');
        body.codeEditor({id:'transfer-request',value:'^transferRequest',language:'json',label:'Request on the local workspace',disabled:'^busy'});
        action(body,'Run on the local database','editTransfer',{id:'transfer-edit'});
        body.p('Loading creates a separate IndexedDB database. The check uses complete sources, sources per package and per table: it changes a document, adds a row and compares the result with Python. The exported file holds the snapshot, not synchronization instructions.',{class:'db-note'});
        body.p('^transferStatus',{id:'transfer-status',role:'status'});
        detail(body,'Transfer checks','transferChecks','transfer-checks',true);
        detail(body,'Nested Bags and blobs: structure, attributes and bytes','transferBinarySample','transfer-binary-sample');
        detail(body,'Structure and values','transferSample','transfer-sample');
    }
}
