import {PlaygroundPage, action, detail} from './base.js';
export class TransferPage extends PlaygroundPage {
    static section = 'transfer';
    static title = 'Asqueel JS · Trasferimento offline · Gramlot';
    content(root) {
        const section = root.main({class:'database single-panel'});
        section.h2('Python → browser → Python');
        const body = section.div({class:'db-content'});
        body.p('La Bag sorgente ricrea il modello e le tabelle SQLite; i record viaggiano in TYTX. La selezione dei dati e la sincronizzazione restano all’applicazione.');
        const actions=body.div({class:'db-actions'});
        action(actions, 'Verifica trasferimento con Python', 'checkTransfers', {id:'transfer-test'});
        action(actions, 'Scarica esempio Python', 'downloadTransferExample', {id:'transfer-example'});
        body.html_label('Snapshot Python (.json)', {for:'transfer-file'});
        body.input({id:'transfer-file',type:'file',accept:'.json',disabled:'^busy',connect_onchange:'playground.selectTransferFile'});
        body.p('^transferFileName');
        const load=body.div({class:'db-actions'});
        action(load,'Carica in SQLite locale','loadTransfer',{id:'transfer-load'});
        action(load,'Esporta snapshot per Python','downloadTransfer',{id:'transfer-export'});
        body.p('Il caricamento crea un database IndexedDB separato. La verifica usa sorgenti complete, per package e per tabelle: modifica un documento, aggiunge una riga e confronta il risultato con Python. Il file esportato contiene lo snapshot, non istruzioni di sincronizzazione.',{class:'db-note'});
        body.p('^transferStatus',{id:'transfer-status',role:'status'});
        detail(body,'Verifiche del trasferimento','transferChecks','transfer-checks',true);
        detail(body,'Struttura e valori','transferSample','transfer-sample');
    }
}
