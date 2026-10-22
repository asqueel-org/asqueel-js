import {Page as BasePage} from '@gramlot/gramlot/page';
import {workerSource} from './dist/assembly-assets.js';
import seed from '../examples/assembly-seed.json' with {type:'json'};

import {escapeHTML,noteHTML,noteText,hasMinutesText} from './assembly-text.js';
import * as views from './assembly-views.js';
const messages={ORARIO_NON_VALIDO:'Orario dell’intervento non valido. Riapri il nuovo intervento.',INTERVENTO_NON_VALIDO:'Intervento non disponibile: ricarica i dati prima di riprovare.',NOTA_MODIFICATA:'Questo testo è cambiato in un’altra finestra. Annulla la bozza per ricaricarlo prima di riprovare.',AGENDA_MODIFICATA:'L’ordine del giorno è cambiato in un’altra finestra. Annulla la bozza e ricarica prima di riprovare.',AGENDA_NON_VALIDA:'La bozza deve conservare tutti i punti, senza duplicati.',TITOLO_NON_VALIDO:'Inserisci un titolo da 1 a 120 caratteri.',ARGOMENTO_VOTATO:'Il titolo non si modifica dopo l’apertura del voto.',ORDINE_NON_VALIDO:'Il punto non può essere spostato in questa posizione.',VOTAZIONE_APERTA:'Chiudi la votazione prima di procedere.',PERSONA_SCONOSCIUTA:'Partecipante sconosciuto.',
    RIMUOVERE_DELEGA:'Rimuovi la delega prima di registrare la presenza.',DELEGA_NON_VALIDA:'La delega richiede un delegante assente e un’altra persona presente.',
    VOTAZIONE_NON_VALIDA:'Inserisci un titolo da 1 a 120 caratteri.',NESSUN_RAPPRESENTATO:'Registra almeno una presenza prima di aprire la votazione.',
    VOTAZIONE_NON_APERTA:'La votazione non è aperta.',VOTO_NON_VALIDO:'Voto o partecipante non ammesso.',VOTI_MANCANTI:'Registra tutti i voti prima di chiudere.',
    PUNTO_NON_VALIDO:'Il punto non è disponibile per questa operazione.',PUNTO_CONCLUSO:'Il punto è concluso e conservato nel verbale.',
    VERBALE_MANCANTE:'Scrivi e salva il blocco di verbale prima di concludere il punto.',TESTO_NON_VALIDO:'Le note possono contenere fino a 20.000 caratteri.'};
const choices={yes:'👍 Sì',no:'👎 No',abstain:'➖ Astenuto'};
const choiceNames={yes:'Favorevole',no:'Contrario',abstain:'Astenuto'};
const button=(parent,text,func,id,args={},attrs={})=>parent.button(text,{id,disabled:'^busy',...attrs}).dataController({func,...args});
const next=(parent,label,step,id)=>button(parent,label,'step',id,{step});
export class Page extends BasePage {
    static title='Assemblea · Gramlot e Asqueel-JS';
    static css=['/themes/gramlot-base/theme.css','/themes/gramlot-compact/theme.css','/themes/mimi/theme.css'];
    main(root) {
        for(const [key,value] of Object.entries({busy:true,ready:false,status:'Avvio del database locale…',noBallot:true,rosterLocked:true,
            phase:'constitution',workStep:'topic',selectedAgenda:'a1',drawerMode:'close',drawerWidth:'310px',centerHidden:false,editorLocked:false,canOpen:false,notesDirty:false,pendingNotes:'',interventionSpeaker:'',interventionText:'',interventionComposerHidden:true,interventionAdministrator:false,interventionRegisterLocked:true,interventionCopyLocked:true,minutesText:'',discussionText:'',
            activeTitle:'Nessuna votazione aperta',history:'Nessuna votazione conclusa.',diagnostics:'',online:'',rosterSearch:'',rosterFilter:'all',newAgendaTitle:'',agendaUnlocked:false,agendaDirty:false,agendaSaveLocked:true,agendaEditLocked:true,agendaMoveLocked:true,agendaCanDrag:false,agendaLockLabel:'🔒',agendaLockHint:'Sblocca le modifiche',agendaDraftStatus:'Ordine del giorno protetto.',documentURL:'about:blank',noDocument:true}))
            root.dataSetter({destination_path:key,value});
        const main=root.main({class:'assembly'}),header=main.header({class:'assembly-header'});
        const brand=header.div();brand.span('GRAMLOT × ASQUEEL-JS',{class:'eyebrow'});brand.h1('Residenza dei Tigli');brand.p('^assemblySubtitle',{class:'subtitle'});
        const tools=header.div({class:'toolbar'});
        button(tools,'👥 Partecipanti','toggleDrawer','assembly-participants',{}, {title:'Apri o chiudi il drawer dei partecipanti'});
        button(tools,'📤 Esporta','exportSnapshot','assembly-export',{}, {title:'Esporta struttura e dati per Python'});
        button(tools,'↺ Nuova prova','reset','assembly-reset');
        const summary=main.div({class:'summary-bar'});
        for(const [key,label] of [['present','in sala'],['represented','rappresentati'],['weight','millesimi']]){
            const stat=summary.div({class:'summary-stat'});stat.strong('^attendance.'+key,{id:'attendance-'+key});stat.span(label);
        }
        summary.span('^online',{id:'assembly-network',class:'network'});
        const frame=main.borderContainer({class:'workspace',height:'100%',flex:'1',min_height:0});
        const center=frame.contentPane({region:'center',min_width:0,hidden:'^centerHidden'});
        const tabs=center.tabContainer({id:'assembly-tabs',height:'100%',selectedPage:'^phase',tabMode:'underline'});
        this.constitution(tabs.contentPane({pageName:'constitution',title:'Costituzione',icon:'🏛️',class:'tab-page'}));
        this.agendaPage(tabs.contentPane({pageName:'agenda',title:'Ordine del giorno',icon:'📋',class:'tab-page'}));
        this.work(tabs.contentPane({pageName:'work',title:'Lavori',icon:'💬',class:'work-page'}));
        const minutes=tabs.contentPane({pageName:'minutes',title:'Verbale',icon:'📝',class:'tab-page'});
        minutes.h2('Il verbale prende forma, punto per punto');minutes.p('Bozze ed esiti restano distinti. Il testo viene conservato nell’export insieme ai voti e ai millesimi.',{class:'muted'});
        minutes.htmlPreview({value:'^minutesDocumentHTML',id:'minutes-document',class:'minutes-preview',height:'650px'});
        this.documentsPage(tabs.contentPane({pageName:'documents',title:'Documenti',icon:'📎',class:'documents-page'}));
        const data=tabs.contentPane({pageName:'data',title:'Dati',icon:'🔎',class:'tab-page'});
        data.h2('Dati e confronto Python');data.p('Stesso modello, SQL e risultati verificati in Python e JavaScript. La scheda mostra anche le operazioni dell’ultima azione.',{class:'muted'});
        data.h3('Votazioni concluse');data.p('^history',{id:'assembly-history',class:'history'});data.pre('^diagnostics',{id:'assembly-diagnostics'});
        const drawer=frame.contentPane({region:'right',width:'^drawerWidth',drawer:'^drawerMode',drawer_label:'👥',drawer_title:'Partecipanti',drawer_onclick:'drawerChanged',class:'participants-drawer'});
        const dh=drawer.div({class:'section-heading'});dh.h2('Partecipanti');button(dh,'✕','toggleDrawer','drawer-close',{}, {'aria-label':'Chiudi partecipanti'});
        drawer.p('Situazione attuale · aggiornata a ogni operazione',{class:'muted'});
        drawer.div({id:'drawer-people',class:'drawer-list'});
        button(drawer,'🏛️ Gestisci presenze','goConstitution','drawer-manage');
        main.p('^status',{id:'assembly-status',role:'status',class:'notice'});
        root.dataController({func:'interventionDraftChanged',speaker:'^interventionSpeaker',text:'^interventionText'});
        root.dataController({func:'filterRoster',search:'^rosterSearch',mode:'^rosterFilter'});
        for(const field of ['discussion','minutes'])root.dataController({func:'noteTextChanged',field,value:'^'+field+'Text'});
        root.dataController({func:'start',_onStart:true});
    }
    constitution(pane){
        const head=pane.div({class:'section-heading'});const intro=head.div();intro.h2('Costituzione dell’assemblea');intro.p('Registra ingressi e deleghe. I millesimi si aggiornano subito.',{class:'muted'});
        button(head,'📋 Ordine del giorno →','goAgenda','constitution-next');
        pane.p('Delega: registra prima l’ingresso del delegato con ✓. Nella riga dell’assente scegli il suo nome in «Delega a» e premi ✓ Conferma. Esempio: Paolo assente → Anna presente. Per revocare, scegli Nessuna e premi ✓ Conferma.',{class:'rule quick-guide',id:'delegate-help'});
        const filters=pane.div({class:'roster-toolbar'});
        filters.input({type:'search',value:'^rosterSearch',id:'roster-search',placeholder:'Cerca nome o unità…','aria-label':'Cerca partecipante'});
        const mode=filters.select({value:'^rosterFilter',id:'roster-filter','aria-label':'Filtra appello'});
        for(const [value,label]of [['all','Tutti'],['pending','Da appellare'],['present','Presenti'],['absent','Assenti'],['delegated','Con delega']])mode.option(label,{value});
        filters.span('^rosterSummary',{class:'muted',id:'roster-summary'});
        pane.div({id:'roster-rows',class:'roster-grid',role:'table','aria-label':'Appello, presenze e deleghe'});
        pane.p('^rosterEmpty',{class:'muted'});
        pane.p('Appello: ✓ ingresso · ↗ uscita · − assenza. Ogni delega rappresenta una persona e i suoi millesimi. Durante una votazione, presenze e deleghe restano bloccate.',{class:'rule'});
        pane.p('Questo esempio calcola pesi e voti, senza verificare i quorum legali di costituzione o deliberazione.',{class:'muted'});
    }
    agendaPage(pane){
        const head=pane.div({class:'section-heading agenda-heading'}),intro=head.div();
        intro.h2('Ordine del giorno');intro.p('Apri un punto per discutere, votare e scrivere il relativo blocco di verbale.',{class:'muted'});
        button(head,'^agendaLockLabel','toggleAgendaLock','agenda-lock',{}, {title:'^agendaLockHint','aria-label':'^agendaLockHint','aria-pressed':'^agendaUnlocked'});
        const add=pane.div({class:'agenda-add',hidden:'^agendaEditLocked'});add.input({value:'^newAgendaTitle',id:'agenda-new-title',maxlength:120,placeholder:'Titolo del nuovo punto…','aria-label':'Titolo del nuovo punto',disabled:'^agendaEditLocked'});
        button(add,'＋ Aggiungi','addAgenda','agenda-add',{}, {disabled:'^agendaEditLocked'});
        pane.div({class:'agenda-list',id:'agenda-rows'});
        const footer=pane.div({class:'agenda-savebar'});
        footer.span('^agendaDraftStatus',{id:'agenda-draft-status',class:'muted',role:'status','aria-live':'polite'});
        const actions=footer.div({class:'agenda-actions'});
        button(actions,'Annulla','discardAgenda','agenda-discard',{}, {disabled:'^agendaSaveLocked'});
        button(actions,'💾 Salva cambiamenti','saveAgenda','agenda-save',{}, {disabled:'^agendaSaveLocked'});
        pane.p('Sblocca 🔒 per modificare. Uscendo dal campo aggiorni la bozza; Salva cambiamenti la conserva offline. Trascina ⠿ sulla posizione desiderata, oppure seleziona due maniglie con un clic o da tastiera. I titoli già votati restano protetti; durante un voto aperto il riordino è sospeso.',{class:'rule'});
    }
    documentsPage(pane){
        pane=pane.div({class:'documents-layout'});
        pane.h2('Documenti per la discussione');pane.p('Preventivi e prospetti di fantasia, disponibili offline e inclusi nell’export. Nessuna validità commerciale.',{class:'muted'});
        pane.div({id:'document-list',class:'document-list'});
        const tools=pane.div({class:'actions'});tools.strong('^documentTitle',{class:'grow'});
        button(tools,'⬇ Scarica HTML','downloadDocument','document-download',{}, {disabled:'^noDocument'});
        button(tools,'↩ Al punto','documentPoint','document-point',{}, {disabled:'^noDocument'});
        pane.iframe({id:'document-preview',src:'^documentURL',title:'^documentTitle',sandbox:'',class:'document-preview',hidden:'^noDocument'});
    }
    work(pane){
        pane=pane.div({class:'work-layout'});
        const top=pane.div({class:'work-heading'});const select=top.select({value:'^agendaSelection',id:'work-agenda','aria-label':'Punto all’ordine del giorno'});
        // Options are rebuilt from the persisted agenda, including newly added points.
        button(top,'Apri','selectAgenda','work-select',{agenda:'=agendaSelection'});top.span('^itemStatus',{class:'item-state'});
        pane.p('^pendingNotes',{class:'muted pending-notes',id:'pending-notes',role:'status',title:'^pendingNotes'});
        const nav=pane.nav({class:'step-nav','aria-label':'Fasi del punto'});
        for(const [key,label]of [['topic','📋 Argomento'],['discussion','💬 Discussione'],['vote','🗳️ Votazione'],['minutes','📝 Verbale']])
            button(nav,label,'step','step-'+key,{step:key},{class:'^steps.'+key,'aria-current':'^stepCurrent.'+key});
        const stack=pane.stackContainer({id:'work-stack',selectedPage:'^workStep',height:'100%',flex:'1',min_height:0});
        const topic=stack.contentPane({pageName:'topic',class:'stack-page'});topic.span('PUNTO ALL’ORDINE DEL GIORNO',{class:'eyebrow'});topic.h2('^itemTitle');
        topic.p('^itemSummary',{class:'muted'});topic.p('Il percorso conserva discussione, esito della votazione e blocco di verbale. Puoi tornare alle fasi precedenti per consultarle.',{class:'reading-text'});
        topic.h3('Documenti allegati');topic.div({id:'topic-documents'});
        next(topic,'💬 Avvia discussione →','discussion','topic-next');
        const discussionFrame=this.phaseFrame(stack.contentPane({pageName:'discussion',class:'stack-page note-page discussion-page'}),'discussion','Discussione','^discussionStatus');
        const add=discussionFrame.tools,edit=discussionFrame.commit,discussion=discussionFrame.body;
        button(add,'＋ Intervento','startIntervention','intervention-add',{}, {disabled:'^interventionNewLocked',title:'Nuovo intervento di un partecipante','aria-label':'Nuovo intervento di un partecipante'});
        button(add,'👤 Amministratore','startIntervention','intervention-admin',{administrator:true},{disabled:'^interventionNewLocked'});
        button(add,'📥 Al verbale','copyInterventions','interventions-copy',{}, {disabled:'^interventionCopyLocked',title:'Aggiungi tutti gli interventi non ancora riportati alla bozza del verbale'});
        button(edit,'↶ Annulla','cancelIntervention','intervention-cancel',{}, {disabled:'^interventionCancelLocked'});
        button(edit,'💾 Registra','registerIntervention','intervention-register',{}, {disabled:'^interventionRegisterLocked',class:'primary-action'});
        const composer=discussion.section({id:'intervention-composer',class:'intervention-composer',hidden:'^interventionComposerHidden'});
        const composerHead=composer.div({class:'composer-heading'});composerHead.h3('^interventionComposerTitle');composerHead.span('^interventionWhen',{class:'muted',id:'intervention-when'});
        const picker=composer.div({hidden:'^interventionAdministrator'});picker.div({id:'intervention-speakers'});
        composer.html_label('Che cosa ha detto?',{for:'intervention-text'});
        composer.textarea({id:'intervention-text',value:'^interventionText',rows:6,disabled:'^editorLocked',placeholder:'Scrivi l’intervento…',maxlength:20000});
        composer.p('La bozza resta qui finché non premi Registra o Annulla.',{class:'muted'});
        const log=discussion.section({class:'intervention-log'}),logHead=log.div({class:'section-heading'});
        logHead.h3('Registro interventi');logHead.span('^interventionCount',{class:'muted',id:'intervention-count'});
        log.div({id:'intervention-list'});
        const legacy=discussion.section({hidden:'^legacyDiscussionHidden',class:'legacy-discussion'});
        legacy.h3('Annotazioni precedenti');legacy.p('^legacyDiscussion',{class:'intervention-excerpt'});
        discussion.p('📥 aggiunge il testo alla bozza del verbale. Potrai rivederlo e salvarlo nella scheda Verbale.',{class:'muted transfer-hint'});
        next(discussionFrame.footer,'Votazione →','vote','discussion-next');
        const voting=stack.contentPane({pageName:'vote',class:'stack-page'});voting.h2('^itemTitle');voting.p('Regola dimostrativa: favorevoli oltre metà dei millesimi rappresentati. Non è una verifica dei quorum legali.',{class:'rule'});
        voting.p('1. Apri il voto dopo aver verificato presenze e deleghe. 2. Registra Sì, No o Astenuto per ogni riga. 3. Quando tutti hanno votato, chiudi il voto e passa al verbale. Ogni scelta è salvata subito offline.',{class:'quick-guide rule',id:'vote-help'});
        const launch=voting.div({class:'actions'});button(launch,'🗳️ Apri votazione','openBallot','ballot-open',{}, {disabled:'^openLocked'});launch.span('^votingHint',{class:'muted'});button(launch,'👥 Presenze e deleghe','goConstitution','vote-roster');
        voting.h3('^activeTitle',{id:'active-title'});
        const active=voting.div({hidden:'^noBallot'});active.p('Ogni gruppo indica chi esprime il voto, per sé e per le deleghe. Registra una scelta su ciascuna riga «Per…»: può essere diversa per ogni soggetto. Gruppi e millesimi sono quelli fissati all’apertura del voto.',{class:'muted'});
        active.p('^voteProgress',{id:'vote-progress',class:'tally',role:'status'});
        active.div({id:'vote-rows'});
        active.p('^tally',{id:'ballot-tally',class:'tally'});const va=active.div({class:'actions'});button(va,'✓ Chiudi voto','closeBallot','ballot-close',{}, {disabled:'^closeLocked'});next(va,'📝 Blocco di verbale →','minutes','vote-next');
        const minutesFrame=this.noteEditor(stack.contentPane({pageName:'minutes',class:'stack-page note-page'}),'minutes','minutes-text','Blocco di verbale','Scrivi il testo da conservare per questo punto…');
        minutesFrame.body.p('^itemOutcome',{class:'rule',id:'item-outcome'});
        button(minutesFrame.footer,'← Ordine del giorno','goAgenda','minutes-next');
        button(minutesFrame.footer,'✓ Concludi punto','completeItem','item-complete',{}, {disabled:'^editorLocked'});
        minutesFrame.body.p('Concludi punto rende il verbale non modificabile. Prima salva o annulla la bozza.',{class:'muted'});
    }
    phaseFrame(pane,id,title,status){
        const layout=pane.div({class:'note-layout'}),bar=layout.div({class:'phase-commandbar',id:id+'-toolbar'});
        const heading=bar.div({class:'phase-heading'});heading.h2(title);heading.span(status,{class:'phase-status',id:id+'-draft-status',role:'status'});
        const actions=bar.div({class:'phase-actions',role:'toolbar','aria-label':'Strumenti '+title});
        const tools=actions.div({class:'phase-tools'}),commit=actions.div({class:'phase-commit'});
        const body=layout.div({class:'note-body',id:id+'-scroll'}),footer=layout.div({class:'phase-footer',id:id+'-footer'});
        return {tools,commit,body,footer};
    }
    noteEditor(pane,field,id,label,placeholder){
        const frame=this.phaseFrame(pane,field,'Verbale','^noteUI.'+field+'.status');
        button(frame.tools,'^noteUI.'+field+'.lockLabel','toggleNoteLock',field+'-lock',{field},{disabled:'^editorLocked',title:'^noteUI.'+field+'.lockHint','aria-label':'^noteUI.'+field+'.lockHint','aria-pressed':'^noteUI.'+field+'.unlocked'});
        button(frame.commit,'↶ Annulla','discardNote',field+'-discard',{field},{disabled:'^noteUI.'+field+'.discardLocked'});
        button(frame.commit,'💾 Salva','saveNote',field+'-save',{field},{disabled:'^noteUI.'+field+'.saveLocked',title:'Salva cambiamenti',class:'primary-action'});
        frame.body.html_label(label,{for:id});
        frame.body.textarea({id,value:'^'+field+'Text',readonly:'^noteUI.'+field+'.readonly',placeholder,rows:14,class:'note-text','aria-label':label});
        return frame;
    }

}
export class Logic {
    async start(node){
        this.node=node;this.pending=new Map();this.sequence=0;
        const url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));this.worker=new Worker(url);
        this.worker.onmessage=({data})=>{const task=this.pending.get(data.id);if(!task)return;this.pending.delete(data.id);data.error?task.reject(new Error(data.error)):task.resolve(data.result);};
        const stop=message=>{this.failure=message;for(const task of this.pending.values())task.reject(new Error(message));this.pending.clear();this.worker.terminate();URL.revokeObjectURL(url);};
        this.worker.onerror=event=>stop(event.message||'Worker SQLite non disponibile');
        const network=()=>node.SET('online',navigator.onLine?'Pronto anche senza rete':'Offline · lavoro locale');network();
        const screen=window.matchMedia('(max-width:520px)'),responsive=()=>{this.narrow=screen.matches;this.updateDrawer();};
        responsive();screen.addEventListener('change',responsive);
        const warn=event=>{
            this.flushNotes();this.flushIntervention();
            const field=document.activeElement,id=field?.id??'',path=id.startsWith('agenda-title-')?'agendaDraft.'+id.slice('agenda-title-'.length):null;
            if(this.hasInterventionDraft()||this.node.GET('agendaDirty')||this.node.GET('notesDirty')||(path&&field.value!==(node.GET(path)??''))){event.preventDefault();event.returnValue='';}
        };
        // Flush text before toolbar actions and navigation, including beforeunload.
        const flush=event=>{if(!event.composedPath().includes(document.getElementById('intervention-text')))this.flushIntervention();for(const field of ['discussion','minutes'])if(!event.composedPath().includes(document.getElementById(field==='minutes'?'minutes-text':field)))this.flushNote(field);};
        for(const type of ['pointerdown','focusin'])document.addEventListener(type,flush,{capture:true,signal:this.page.abort.signal});
        window.addEventListener('beforeunload',warn);
        window.addEventListener('online',network);window.addEventListener('offline',network);
        this.page.abort.signal.addEventListener('abort',()=>{stop('Pagina chiusa');window.removeEventListener('beforeunload',warn);if(this.documentURL)URL.revokeObjectURL(this.documentURL);screen.removeEventListener('change',responsive);window.removeEventListener('online',network);window.removeEventListener('offline',network);},{once:true});
        await this.perform(async()=>{
            const saved=await this.request('transfer-resume');
            this.show(saved??await this.request('transfer-load',{text:JSON.stringify(seed.bundle)}));
            node.SET('status',saved?(saved.view.people.length<24?'Assemblea ripristinata: partecipanti e voti originali conservati. «Nuova prova» carica la demo da 24; esporta prima il lavoro da conservare.':'Assemblea ripristinata da IndexedDB.'):'Esempio Python caricato: puoi registrare le presenze.');
        });node.SET('ready',true);
    }
    request(type,desired){return new Promise((resolve,reject)=>{
        if(this.failure){reject(new Error(this.failure));return;}
        const id=++this.sequence;this.pending.set(id,{resolve,reject});
        this.worker.postMessage({id,type,desired,workspaceName:'asqueel-assembly-v1:'+location.pathname});
    });}
    async perform(callback){
        if(this.running)return false;this.running=true;this.node.SET('busy',true);this.updateLocks();
        try{await callback();return true;}catch(error){this.node.SET('status',messages[error.message]??error.message);this.node.SET('lastError',error.message);return false;}
        finally{this.running=false;this.node.SET('busy',false);this.updateLocks();}
    }
    updateLocks(){
        const view=this.state?.view,item=view?.agenda.find(a=>a.id===this.selected),ballot=view?.ballots.find(b=>b.id===item?.ballot_id);
        this.node.SET('rosterLocked',this.running||!view||view.ballots.some(b=>!b.closed));
        this.node.SET('editorLocked',this.running||!item||!!item.completed);
        this.node.SET('openLocked',this.running||!item||!!item.completed||!!item.ballot_id||view.ballots.some(b=>!b.closed)||!view?.attendance.represented);
        this.node.SET('voteLocked',this.running||!ballot||!!ballot.closed);
        const total=view?.totals.find(t=>t.ballot_id===ballot?.id);
        this.node.SET('closeLocked',!!this.running||!ballot||!!ballot.closed||!!total?.pending);
        for(const field of ['discussion','minutes']){
            const unlocked=!!this.node.GET(`noteUnlocked.${item?.id}.${field}`),dirty=!!item&&this.noteDirty(item.id,field),prefix='noteUI.'+field+'.';
            this.node.SET(prefix+'unlocked',unlocked);this.node.SET(prefix+'readonly',!!this.running||!item||!!item.completed||!unlocked);
            this.node.SET(prefix+'lockLabel',unlocked?'🔓 Blocca':'🔒 Modifica');this.node.SET(prefix+'lockHint',(unlocked?'Blocca ':'Sblocca ')+(field==='discussion'?'discussione':'verbale'));
            this.node.SET(prefix+'discardLocked',!!this.running||!item||!dirty);
            this.node.SET(prefix+'saveLocked',!!this.running||!item||!!item.completed||!dirty);
            this.node.SET(prefix+'status',item?.completed?'Punto concluso · sola lettura':dirty?'Bozza modificata · da salvare offline':unlocked?'Modifica sbloccata · nessun cambiamento':'Testo protetto.');
        }
        for(const p of view?.people??[]){
            const locked=!!this.running||view.ballots.some(b=>!b.closed)||!!p.present;
            this.node.SET('people.'+p.id+'.delegateLocked',locked);
            this.node.SET('people.'+p.id+'.delegateSaveLocked',locked||(this.node.GET('delegates.'+p.id)||null)===(p.delegate_id??null));
        }
        const interventions=(view?.interventions??[]).filter(x=>x.agenda_id===item?.id),pending=this.node.GET('pendingInterventions.'+item?.id)??[];
        const draft=this.node.GET('interventionDrafts.'+item?.id),text=draft?.text??'';
        this.node.SET('interventionRegisterLocked',!!this.running||!item||!!item.completed||!draft||(!draft.administrator&&!draft.person)||!hasMinutesText(text));
        this.node.SET('interventionNewLocked',!!this.running||!item||!!item.completed||!!draft);
        this.node.SET('interventionCancelLocked',!!this.running||!draft);
        this.node.SET('discussionStatus',item?.completed?'Punto concluso · sola lettura':draft?'Nuovo intervento · da registrare':`${interventions.length} interventi · salvati offline`);
        const importLocked=!!this.running||!item||!!item.completed||!!draft;
        this.node.SET('interventionCopyLocked',importLocked||!interventions.some(x=>!x.included&&!pending.includes(x.id)));
        for(const row of interventions){this.node.SET('interventions.'+row.id+'.copyLocked',importLocked||!!row.included||pending.includes(row.id));this.node.SET('interventions.'+row.id+'.status',row.included?'Riportato nel verbale':pending.includes(row.id)?'Nella bozza del verbale':'Da riportare');}
        const editLocked=!!this.running||!view||!this.node.GET('agendaUnlocked');
        const moveLocked=editLocked||!!view?.ballots.some(b=>!b.closed);
        this.node.SET('agendaEditLocked',editLocked);this.node.SET('agendaMoveLocked',moveLocked);this.node.SET('agendaCanDrag',!moveLocked);
        this.node.SET('agendaSaveLocked',!!this.running||!this.node.GET('agendaDirty'));
        for(const id of this.node.GET('agendaOrder')??[]){
            const a=view?.agenda.find(a=>a.id===id);
            this.node.SET('agenda.'+id+'.titleLocked',editLocked||!!a?.completed||!!a?.ballot_id);
            this.node.SET('agenda.'+id+'.openLocked',!!this.running||!a);
        }
    }
    outcome(item){
        const view=this.state.view,b=view.ballots.find(b=>b.id===item.ballot_id),t=view.totals.find(t=>t.ballot_id===b?.id);
        if(!b)return 'Nessuna votazione registrata.';
        const result=!b.closed?'Votazione in corso':b.result==='approvata_demo'?'Approvata secondo la regola demo':'Respinta secondo la regola demo';
        return `${result} · ${t.yes} favorevoli · ${t.no} contrari · ${t.abstain} astenuti / ${t.weight} millesimi${t.pending?` · ${t.pending} voti da registrare`:''}`;
    }
    itemStatus(item){
        if(item.completed)return '✓ Concluso';
        const ballot=this.state.view.ballots.find(b=>b.id===item.ballot_id);
        return ballot?ballot.closed?'📝 Da verbalizzare':'🗳️ Votazione aperta':item.discussion?'💬 In discussione':'Da trattare';
    }
    show(state){
        this.state=state;const {view}=state,n=this.node;
        n.SET('snapshot',JSON.stringify(state));n.SET('diagnostics',JSON.stringify({attendance:view.attendance,agenda:view.agenda,ballots:view.ballots,totals:view.totals,sql:state.actionResult?.trace??[],rows:state.rows},null,2));
        for(const [key,value] of Object.entries(view.attendance))n.SET('attendance.'+key,String(value));
        const names=new Map(view.people.map(p=>[p.id,p.name]));
        for(const p of view.people){
            n.SET('people.'+p.id+'.ledClass','presence-led '+(p.present?'led-present':p.delegate_id?'led-delegated':'led-absent'));
            n.SET('people.'+p.id+'.status',p.present?'Presente':p.delegate_id?`Delega a ${names.get(p.delegate_id)}${p.represented_by?'':' (assente)'}`:p.called?'Assente':'Da appellare');
            n.SET('people.'+p.id+'.button',p.present?'↗':'✓');n.SET('people.'+p.id+'.notPresent',!p.present);n.SET('people.'+p.id+'.rowClass','grid-row '+(p.present?'is-present':p.delegate_id?'is-delegated':''));n.SET('delegates.'+p.id,p.delegate_id??'');
        }
        n.SET('assemblySubtitle',`${view.people.length} partecipanti · ${view.attendance.total} millesimi · dati di fantasia`);
        this.refreshCollections();this.filterRoster();this.refreshNoteDrafts();
        for(const item of view.agenda){n.SET('agenda.'+item.id+'.title',item.title);n.SET('agenda.'+item.id+'.status',this.itemStatus(item));}
        if(!view.agenda.some(a=>a.id===this.selected)){
            const active=view.ballots.find(b=>!b.closed);
            this.selected=(view.agenda.find(a=>a.ballot_id===active?.id)||view.agenda.find(a=>!a.completed)||view.agenda[0]).id;
        }
        const line=t=>`${t.yes} favorevoli · ${t.no} contrari · ${t.abstain} astenuti / ${t.weight} millesimi`;
        const totals=new Map(view.totals.map(t=>[t.ballot_id,t]));
        n.SET('history',view.ballots.filter(b=>b.closed).map(b=>`${b.title}\n${b.result==='approvata_demo'?'Approvata':'Respinta'} secondo la regola demo · ${line(totals.get(b.id))}`).join('\n\n')||'Nessuna votazione conclusa.');
        n.SET('minutesDocument',view.agenda.map(a=>`${a.position}. ${a.title} — ${a.completed?'CONCLUSO':'BOZZA'}\n\nDiscussione\n${a.discussion||'Non ancora annotata.'}\n\n${this.outcome(a)}\n\nVerbale\n${a.minutes||'Da redigere.'}`).join('\n\n────────────────────────────────\n\n'));
        const sections=view.agenda.map(a=>`<section><h2>${a.position}. ${escapeHTML(a.title)}</h2><p class="state">${a.completed?'CONCLUSO':'BOZZA'}</p><h3>Discussione</h3>${noteHTML(a.discussion||'Non ancora annotata.')}<p class="outcome">${escapeHTML(this.outcome(a))}</p><h3>Verbale</h3>${noteHTML(a.minutes||'Da redigere.')}</section>`).join('');
        n.SET('minutesDocumentHTML',`<!doctype html><html lang="it"><head><meta charset="utf-8"><style>body{font:15px/1.75 system-ui;color:#24344a;background:#f5f4f0;margin:0;padding:24px}section{max-width:780px;background:white;margin:0 auto 24px;padding:32px;border:1px solid #d9dfe6;border-radius:8px}h2{line-height:1.3}.state{font-size:11px;letter-spacing:.1em;color:#65758a}.outcome{padding:12px;background:#edf2f8}table{border-collapse:collapse}td,th{border:1px solid #aaa;padding:6px}@media(max-width:500px){body{padding:8px}section{padding:16px}}</style></head><body>${sections}</body></html>`);
        this.renderItem();
    }
    renderItem(){
        const {view}=this.state,n=this.node,item=view.agenda.find(a=>a.id===this.selected),names=new Map(view.people.map(p=>[p.id,p.name]));
        n.SET('selectedAgenda',item.id);n.SET('agendaSelection',item.id);n.SET('itemTitle',`${item.position}. ${item.title}`);n.SET('itemStatus',this.itemStatus(item));
        n.SET('itemSummary',`${view.attendance.represented} soggetti rappresentati · ${view.attendance.weight} millesimi attualmente presenti o delegati.`);n.SET('itemOutcome',this.outcome(item));
        this.loadingNotes=true;this.editorItem=item.id;
        for(const field of ['discussion','minutes'])n.SET('editor.'+field,n.GET(`noteDrafts.${item.id}.${field}`)??item[field]);
        for(const field of ['discussion','minutes'])n.SET(field+'Text',noteText(n.GET(`noteDrafts.${item.id}.${field}`)??item[field]));
        this.loadingNotes=false;this.renderInterventions();this.renderInterventionDraft();
        const ballot=view.ballots.find(b=>b.id===item.ballot_id);this.active=ballot;
        n.SET('noBallot',!ballot);n.SET('activeTitle',ballot?ballot.closed?'Esito conservato':'Votazione in corso':'Votazione non aperta');
        n.SET('votingHint',ballot?'Questo punto ha già una votazione.':view.ballots.some(b=>!b.closed)?'Concludi prima la votazione aperta sull’altro punto.':!view.attendance.represented?'Registra almeno una presenza in Costituzione prima di aprire il voto.':'Verifica presenze e deleghe: aprendo il voto vengono fissati i rappresentati.');
        const votes=view.votes.filter(v=>v.ballot_id===ballot?.id),groups=view.voter_groups.filter(g=>g.ballot_id===ballot?.id);
        const voterKey=JSON.stringify([ballot?.id,this.peopleKey,votes.map(v=>[v.person_id,v.representative_id,v.weight])]);
        if(this.voterKey!==voterKey){this.rebuild('vote-rows',root=>views.votes(root,view.people,votes,groups));this.voterKey=voterKey;}
        for(const group of groups)n.SET('voterGroups.'+group.representative_id+'.progress',`${group.represented-group.pending} / ${group.represented} registrati${group.pending?' · '+group.pending+' da registrare':' · completo'}`);
        for(const p of view.people){const v=view.votes.find(v=>v.ballot_id===ballot?.id&&v.person_id===p.id);
            n.SET('votes.'+p.id+'.hidden',!v);n.SET('votes.'+p.id+'.detail',v?`${v.weight} ‰ · ${v.representative_id===p.id?'Voto personale':'Vota '+names.get(v.representative_id)+' per delega'}`:'');
            n.SET('votes.'+p.id+'.choice',choiceNames[v?.choice]??'Da registrare');for(const key of Object.keys(choices)){n.SET('votes.'+p.id+'.'+key,v?.choice===key?'selected':'');n.SET('votes.'+p.id+'.'+key+'Pressed',v?.choice===key?'true':'false');}}
        this.rebuild('topic-documents',root=>views.documents(root,view.documents.filter(d=>d.agenda_id===item.id),'topic-doc'));
        const pending=votes.filter(v=>!v.choice).length;
        n.SET('voteProgress',`${votes.length-pending} di ${votes.length} voti registrati · ${pending?pending+' da registrare':ballot?.closed?'votazione chiusa':'puoi chiudere il voto'}`);
        n.SET('tally',this.outcome(item));this.markStep();this.updateLocks();
    }
    rebuild(id,render){
        const src=this.page.src;
        const find=bag=>{for(const node of bag.getNodes()){if(node.attr.id===id)return node;const found=node.value?.getNodes&&find(node.value);if(found)return found;}};
        const target=find(src.source);if(!target)throw Error('Contenitore Source mancante: '+id);
        src.renderer.freeze(target);
        try{target.value?.clear();render(src.builder.wrapSource(target));}finally{src.renderer.unfreeze(target);}
    }
    refreshCollections(){
        const {view}=this.state;
        const peopleKey=JSON.stringify(view.people.map(p=>[p.id,p.name,p.unit,p.email,p.weight]));
        if(this.peopleKey!==peopleKey){
            this.rebuild('roster-rows',r=>views.roster(r,view.people));this.rebuild('drawer-people',r=>views.drawer(r,view.people));this.rebuild('intervention-speakers',r=>views.speakers(r,view.people));this.peopleKey=peopleKey;
        }
        if(!this.agendaBase||!this.node.GET('agendaDirty'))this.loadAgendaDraft();
        const agendaKey=JSON.stringify(view.agenda.map(a=>[a.id,a.position,a.title]));
        if(this.agendaKey!==agendaKey){this.rebuild('work-agenda',r=>views.agendaOptions(r,view.agenda));this.agendaKey=agendaKey;}
        const docKey=JSON.stringify(view.documents.map(d=>[d.id,d.title,d.agenda_id]));
        if(this.docKey!==docKey){this.rebuild('document-list',r=>views.documents(r,view.documents,'document'));this.docKey=docKey;}
    }
    filterRoster(){
        if(!this.state)return;
        const term=(this.node.GET('rosterSearch')??'').trim().toLocaleLowerCase('it'),mode=this.node.GET('rosterFilter')??'all';let visible=0;
        const people=this.state.view.people;
        for(const p of people){const match=(!term||`${p.name} ${p.unit??''}`.toLocaleLowerCase('it').includes(term))&&
            (mode==='all'||mode==='pending'&&!p.called&&!p.present&&!p.delegate_id||mode==='present'&&p.present||mode==='absent'&&p.called&&!p.present&&!p.delegate_id||mode==='delegated'&&p.delegate_id);
            this.node.SET('people.'+p.id+'.filtered',!match);if(match)visible++;}
        const pending=people.filter(p=>!p.called&&!p.present&&!p.delegate_id).length;
        this.node.SET('rosterSummary',`${visible} / ${people.length} · ${pending} da appellare`);this.node.SET('rosterEmpty',visible?'':'Nessun partecipante corrisponde al filtro.');
    }
    agendaItems(){return (this.node.GET('agendaOrder')??[]).map(id=>({id,title:this.node.GET('agendaDraft.'+id)??''}));}
    loadAgendaDraft(){
        this.loadingAgenda=true;
        this.agendaBase=this.state.view.agenda.map(({id,title})=>({id,title}));
        this.node.SET('agendaOrder',this.agendaBase.map(a=>a.id));
        for(const a of this.agendaBase)this.node.SET('agendaDraft.'+a.id,a.title);
        this.node.SET('agendaDirty',false);this.node.SET('newAgendaTitle','');this.pickedAgenda=null;
        this.renderAgendaDraft();this.loadingAgenda=false;this.agendaChanged();
    }
    renderAgendaDraft(){
        this.rebuild('agenda-rows',r=>views.agendaRows(r,this.agendaItems().map((a,i)=>({...a,position:i+1}))));
        for(const a of this.agendaItems()){
            const item=this.state.view.agenda.find(x=>x.id===a.id);
            this.node.SET('agenda.'+a.id+'.status',item?this.itemStatus(item):'Nuovo punto · da salvare');
            this.node.SET('agenda.'+a.id+'.handleClass',a.id===this.pickedAgenda?'agenda-handle selected':'agenda-handle');
        }
        this.updateLocks();
    }
    agendaChanged(){
        if(this.loadingAgenda||!this.agendaBase)return;
        const dirty=JSON.stringify(this.agendaItems())!==JSON.stringify(this.agendaBase);
        this.node.SET('agendaDirty',dirty);
        this.node.SET('agendaDraftStatus',dirty?'Bozza modificata · da salvare offline':this.node.GET('agendaUnlocked')?'Modifica sbloccata · nessun cambiamento':'Ordine del giorno protetto.');
        this.updateLocks();
    }
    toggleAgendaLock(){
        const unlocked=!this.node.GET('agendaUnlocked');this.node.SET('agendaUnlocked',unlocked);
        this.node.SET('agendaLockLabel',unlocked?'🔓':'🔒');this.node.SET('agendaLockHint',unlocked?'Blocca le modifiche':'Sblocca le modifiche');
        this.pickedAgenda=null;this.renderAgendaDraft();this.agendaChanged();
    }
    addAgenda(){
        if(this.node.GET('agendaEditLocked'))return;
        const title=(this.node.GET('newAgendaTitle')??'').trim();
        if(!title||title.length>120){this.node.SET('status',messages.TITOLO_NON_VALIDO);return;}
        const order=this.node.GET('agendaOrder'),id=`a${order.length+1}`;
        this.node.SET('agendaDraft.'+id,title);this.node.SET('agendaOrder',[...order,id]);
        this.node.SET('newAgendaTitle','');this.renderAgendaDraft();this.agendaChanged();
    }
    dragAgenda(node,{dragValues}){
        if(this.node.GET('agendaMoveLocked'))return false;
        dragValues['text/x-assembly-agenda']=node.attr.id.slice('agenda-drag-'.length);
    }
    allowAgendaDrop(node,{dropValues}){
        const id=dropValues['text/x-assembly-agenda'],target=node.attr.id.slice('agenda-row-'.length),order=this.node.GET('agendaOrder')??[];
        return !this.node.GET('agendaMoveLocked')&&id!==target&&order.includes(id)&&order.includes(target);
    }
    dropAgenda(node,{dropValues}){this.reorderAgenda(dropValues['text/x-assembly-agenda'],node.attr.id.slice('agenda-row-'.length));}
    pickAgenda(node,{agenda}){
        if(this.node.GET('agendaMoveLocked'))return;
        if(this.pickedAgenda&&this.pickedAgenda!==agenda){this.reorderAgenda(this.pickedAgenda,agenda);return;}
        this.pickedAgenda=this.pickedAgenda===agenda?null:agenda;
        for(const {id} of this.agendaItems())this.node.SET('agenda.'+id+'.handleClass',id===this.pickedAgenda?'agenda-handle selected':'agenda-handle');
        this.node.SET('agendaDraftStatus',this.pickedAgenda?'Punto selezionato · scegli la maniglia della posizione di arrivo':'Spostamento annullato.');
    }
    reorderAgenda(id,target){
        if(this.node.GET('agendaMoveLocked'))return;
        const order=[...this.node.GET('agendaOrder')],from=order.indexOf(id),to=order.indexOf(target);
        if(from<0||to<0||from===to)return;
        order.splice(from,1);order.splice(to,0,id);this.node.SET('agendaOrder',order);
        this.pickedAgenda=null;this.renderAgendaDraft();this.agendaChanged();
    }
    async saveAgenda(){
        if(this.running||!this.node.GET('agendaDirty'))return;
        if(await this.act({kind:'agenda_save',base:this.agendaBase,items:this.agendaItems()}))this.loadAgendaDraft();
    }
    async discardAgenda(){
        if(this.running)return;
        if(this.node.GET('agendaDirty')&&!window.confirm('Annullare le modifiche non ancora salvate all’ordine del giorno?'))return;
        await this.perform(async()=>{const state=await this.request('transfer-resume');this.node.SET('agendaDirty',false);this.show(state);this.node.SET('status','Bozza annullata. Ordine del giorno ricaricato.');});
    }
    openDocument(node,{document}){
        const doc=this.state.view.documents.find(d=>d.id===document);if(!doc)return;
        if(this.documentURL)URL.revokeObjectURL(this.documentURL);
        this.documentURL=URL.createObjectURL(new Blob([doc.content],{type:doc.mime}));this.document=doc;
        this.node.SET('documentURL',this.documentURL);this.node.SET('documentTitle',doc.title);this.node.SET('noDocument',false);this.node.SET('phase','documents');
    }
    downloadDocument(){if(!this.document)return;const a=document.createElement('a');a.href=this.documentURL;a.download=this.document.filename;a.click();}
    documentPoint(){if(this.document)return this.selectAgenda(null,{agenda:this.document.agenda_id});}
    markStep(){for(const key of ['topic','discussion','vote','minutes']){const selected=this.node.GET('workStep')===key;this.node.SET('steps.'+key,selected?'step-selected':'');this.node.SET('stepCurrent.'+key,selected?'step':'false');}}
    step(node,{step}){this.node.SET('workStep',step);this.markStep();}
    updateDrawer(){this.node.SET('drawerWidth',this.narrow?'100%':'310px');this.node.SET('centerHidden',!!this.narrow&&this.node.GET('drawerMode')===true);}
    toggleDrawer(){this.node.SET('drawerMode',this.node.GET('drawerMode')===true?'close':true);this.updateDrawer();}
    drawerChanged(node,{show}){this.node.SET('drawerMode',show?true:'close');this.updateDrawer();}
    goConstitution(){this.node.SET('phase','constitution');this.node.SET('drawerMode','close');this.updateDrawer();}
    goAgenda(){this.node.SET('phase','agenda');}
    async selectAgenda(node,{agenda}){
        if(!this.state.view.agenda.some(a=>a.id===agenda))return;
        this.selected=agenda;this.renderItem();this.node.SET('phase','work');this.step(node,{step:'topic'});
    }
    act(action){return this.perform(async()=>{const result=await this.request('workspace-action',{action});this.show(result);this.node.SET('lastError','');this.node.SET('status','Operazione salvata nel database locale.');});}
    markAbsent(node,{person}){return this.act({kind:'presence',person,present:false});}
    presence(node,{person}){return this.act({kind:'presence',person,present:!this.state.view.people.find(p=>p.id===person).present});}
    delegate(node,{person,delegate}){return this.act({kind:'delegate',person,delegate:delegate||null});}
    renderInterventions(){
        const rows=this.state.view.interventions.filter(x=>x.agenda_id===this.selected),key=JSON.stringify([this.selected,rows]);
        this.node.SET('interventionCount',`${rows.length} interventi`);
        const previous=this.state.view.agenda.find(a=>a.id===this.selected).discussion;
        this.node.SET('legacyDiscussionHidden',!previous||rows.some(x=>x.text===previous));this.node.SET('legacyDiscussion',noteText(previous));
        if(this.interventionsKey!==key){
            const display=rows.map(x=>({...x,excerpt:noteText(x.text),time:this.interventionTime(x.recorded_at)}));
            this.rebuild('intervention-list',root=>views.interventions(root,display));this.interventionsKey=key;
        }
    }
    interventionTime(value){return value?new Date(value).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Orario non disponibile';}
    renderInterventionDraft(){
        const draft=this.node.GET('interventionDrafts.'+this.selected);
        this.loadingIntervention=true;
        this.node.SET('interventionComposerHidden',!draft);this.node.SET('interventionAdministrator',!!draft?.administrator);
        this.node.SET('interventionSpeaker',draft?.person??'');this.node.SET('interventionText',draft?.text??'');
        this.node.SET('interventionComposerTitle',draft?.administrator?'Intervento dell’amministratore':'Chi interviene?');
        this.node.SET('interventionWhen',draft?this.interventionTime(draft.recorded_at):'');this.loadingIntervention=false;
    }
    startIntervention(node,{administrator=false}={}){
        if(this.node.GET('interventionNewLocked'))return;
        const previous=this.node.GET('interventionDrafts.'+this.selected);
        if(previous?.text?.trim()){this.node.SET('status','Registra o annulla l’intervento in preparazione prima di aggiungerne un altro.');return;}
        this.node.SET('interventionDrafts.'+this.selected,{administrator,person:null,text:'',recorded_at:new Date().toISOString()});
        this.renderInterventionDraft();this.updateLocks();
        queueMicrotask(()=>document.getElementById(administrator?'intervention-text':'intervention-speaker')?.focus());
    }
    flushIntervention(){
        if(!this.node||this.loadingIntervention||!this.node.GET('interventionDrafts.'+this.selected))return;
        const text=document.getElementById('intervention-text')?.value;
        if(text!==undefined&&text!==this.node.GET('interventionText'))this.node.SET('interventionText',text);
        this.interventionDraftChanged();
    }
    interventionDraftChanged(){
        if(this.loadingIntervention||!this.state)return;
        const path='interventionDrafts.'+this.selected,draft=this.node.GET(path);if(!draft)return;
        this.node.SET(path,{...draft,person:draft.administrator?null:this.node.GET('interventionSpeaker')||null,text:this.node.GET('interventionText')??''});this.updateLocks();
    }
    hasInterventionDraft(){return this.state?.view.agenda.some(a=>this.node.GET('interventionDrafts.'+a.id)?.text?.trim());}
    cancelIntervention(){
        this.flushIntervention();const draft=this.node.GET('interventionDrafts.'+this.selected);
        if(draft?.text?.trim()&&!window.confirm('Annullare questo intervento non registrato?'))return;
        this.node.SET('interventionDrafts.'+this.selected,null);this.renderInterventionDraft();this.updateLocks();
    }
    async registerIntervention(){
        this.flushIntervention();if(this.node.GET('interventionRegisterLocked'))return;
        const id=this.selected,draft=this.node.GET('interventionDrafts.'+id),base=this.state.view.agenda.find(a=>a.id===id).discussion;
        const action={kind:'intervention_add',id:`i${this.state.view.interventions.length+1}`,agenda:id,base,text:draft.text,recorded_at:draft.recorded_at,...(draft.administrator?{administrator:true}:{person:draft.person})};
        if(await this.act(action)){
            this.node.SET('interventionDrafts.'+id,null);this.renderInterventionDraft();this.updateLocks();
        }
    }
    copyInterventions(node,{intervention}={}){
        this.flushNote('minutes');
        if(this.node.GET('editorLocked')||this.node.GET('interventionDrafts.'+this.selected))return;
        const id=this.selected,pending=this.node.GET('pendingInterventions.'+id)??[];
        const rows=this.state.view.interventions.filter(x=>x.agenda_id===id&&!x.included&&!pending.includes(x.id)&&(!intervention||x.id===intervention));
        if(!rows.length)return;
        const previous=this.node.GET(`noteDrafts.${id}.minutes`)??'';
        const value=[noteText(previous),...rows.map(x=>`Intervento ${x.position} — ${x.speaker}\n${noteText(x.text)}`)].filter(Boolean).join('\n\n');
        if([...value].length>20000){this.node.SET('status','Il verbale supererebbe 20.000 caratteri. Riporta un intervento alla volta e sintetizza il testo.');return;}
        this.node.SET('noteUnlocked.'+id+'.minutes',true);
        this.node.SET('pendingInterventions.'+id,[...pending,...rows.map(x=>x.id)]);this.node.SET('minutesText',value);this.noteTextChanged(null,{field:'minutes'});
        this.step(null,{step:'minutes'});this.node.SET('status','Interventi aggiunti alla bozza. Il verbale è modificabile: rivedi il testo e premi Salva.');
    }
    flushNotes(){for(const field of ['discussion','minutes'])this.flushNote(field);}
    flushNote(field){
        const editor=document.getElementById(field==='minutes'?'minutes-text':field);
        if(!this.editorItem||this.loadingNotes||!editor)return;
        const value=editor.value;
        if(value!==this.node.GET(field+'Text')){this.node.SET(field+'Text',value);this.noteTextChanged(null,{field});}
    }
    noteTextChanged(node,{field}){
        if(this.loadingNotes||!this.editorItem||!this.state)return;
        const value=this.node.GET(field+'Text')??'',old=this.node.GET(`noteDrafts.${this.editorItem}.${field}`)??'';
        if(value===noteText(old))return;
        this.node.SET('editor.'+field,value);this.node.SET(`noteDrafts.${this.editorItem}.${field}`,value);this.refreshNotesStatus();this.updateLocks();
    }
    noteDirty(id,field){return this.node.GET(`noteDrafts.${id}.${field}`)!==this.node.GET(`noteBase.${id}.${field}`)||(field==='minutes'&&!!this.node.GET('pendingInterventions.'+id)?.length);}
    refreshNoteDrafts(){
        for(const item of this.state.view.agenda)for(const field of ['discussion','minutes']){
            const path=`${item.id}.${field}`;
            if(!this.noteDirty(item.id,field)){
                this.node.SET('noteBase.'+path,item[field]);this.node.SET('noteDrafts.'+path,item[field]);
            }
        }
        this.refreshNotesStatus();
    }
    refreshNotesStatus(){
        const pending=this.state.view.agenda.filter(a=>['discussion','minutes'].some(f=>this.noteDirty(a.id,f)));
        this.node.SET('notesDirty',pending.length>0);
        this.node.SET('pendingNotes',pending.length?`Bozze da salvare: ${pending.map(a=>a.position+'. '+a.title).join(' · ')}`:'');
    }
    toggleNoteLock(node,{field}){
        if(this.node.GET('editorLocked'))return;
        const path=`noteUnlocked.${this.selected}.${field}`;this.node.SET(path,!this.node.GET(path));this.updateLocks();
    }
    async saveNote(node,{field}){
        const id=this.selected;if(this.running||!this.noteDirty(id,field))return;
        const value=this.node.GET(`noteDrafts.${id}.${field}`),base=this.node.GET(`noteBase.${id}.${field}`);
        const ids=field==='minutes'?this.node.GET('pendingInterventions.'+id)??[]:[];
        if(await this.act({kind:'note_save',agenda:id,field,base,value,...(ids.length?{interventions:ids}:{})})){
            if(field==='minutes')this.node.SET('pendingInterventions.'+id,[]);
            this.node.SET(`noteBase.${id}.${field}`,value);this.refreshNotesStatus();this.updateLocks();
        }
    }
    async discardNote(node,{field}){
        if(this.running||!window.confirm('Annullare le modifiche non salvate a questo testo?'))return;
        const id=this.selected;
        await this.perform(async()=>{
            const state=await this.request('transfer-resume'),item=state.view.agenda.find(a=>a.id===id);
            if(field==='minutes')this.node.SET('pendingInterventions.'+id,[]);
            this.node.SET(`noteBase.${id}.${field}`,item[field]);this.node.SET(`noteDrafts.${id}.${field}`,item[field]);
            this.show(state);this.node.SET('status','Bozza annullata. Testo ricaricato.');
        });
    }
    requireSavedNotes(all=false){
        this.flushIntervention();
        const draft=this.state.view.agenda.find(a=>(all||a.id===this.selected)&&this.node.GET('interventionDrafts.'+a.id)?.text?.trim());
        if(draft){this.selected=draft.id;this.renderItem();this.node.SET('phase','work');this.step(null,{step:'discussion'});this.node.SET('status','Registra o annulla l’intervento in preparazione prima di proseguire.');return false;}
        const item=this.state.view.agenda.find(a=>(all||a.id===this.selected)&&['discussion','minutes'].some(f=>this.noteDirty(a.id,f)));
        if(!item)return true;
        this.selected=item.id;this.renderItem();this.node.SET('phase','work');this.step(null,{step:['discussion','minutes'].find(f=>this.noteDirty(item.id,f))});
        this.node.SET('status','Salva o annulla le modifiche al testo prima di proseguire.');return false;
    }
    delegateChanged(){if(this.node&&this.state)this.updateLocks();}
    openBallot(){return this.act({kind:'open',id:`b${this.state.view.ballots.length+1}`,agenda:this.selected});}
    vote(node,{person,choice}){return this.act({kind:'vote',ballot:this.active?.id,person,choice});}
    async closeBallot(){if(await this.act({kind:'close',ballot:this.active?.id}))this.step(null,{step:'minutes'});}
    async completeItem(){if(this.requireSavedNotes())return this.act({kind:'complete',agenda:this.selected});}
    reset(){if(!window.confirm('Sostituire questa prova con l’esempio Python iniziale? Esporta prima i risultati da conservare.'))return;
        return this.perform(async()=>{this.selected=null;this.editorItem=null;for(const a of this.state.view.agenda)for(const f of ['discussion','minutes']){this.node.SET(`noteBase.${a.id}.${f}`,null);this.node.SET(`noteDrafts.${a.id}.${f}`,null);this.node.SET(`noteUnlocked.${a.id}.${f}`,false);}for(const item of this.state.view.agenda){this.node.SET('pendingInterventions.'+item.id,[]);this.node.SET('interventionDrafts.'+item.id,null);}this.node.SET('agendaDirty',false);this.show(await this.request('transfer-load',{text:JSON.stringify(seed.bundle)}));this.node.SET('rosterSearch','');this.node.SET('rosterFilter','all');this.goConstitution();this.node.SET('status','Nuova prova pronta: 24 partecipanti e documenti di fantasia.');});}
    async exportSnapshot(){if(this.node.GET('agendaDirty')){this.goAgenda();this.node.SET('status','Salva o annulla le modifiche all’ordine del giorno prima di esportare.');return;}if(!this.requireSavedNotes(true))return;return this.perform(async()=>{
        const bundle=await this.request('transfer-export'),url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download='assemblea-risultati.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        this.node.SET('status','Snapshot esportato per Python.');
    });}
}
