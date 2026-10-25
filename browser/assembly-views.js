// Dynamic collections are authored as Gramlot Source, never injected HTML grids.
const button=(parent,text,func,id,args={},attrs={})=>parent.button(text,{id,disabled:'^busy',...attrs}).dataController({func,...args});
export function roster(root,people){
    const header=root.div({class:'grid-row grid-head',role:'row'});
    for(const [label,cls]of [['Unità','unit-cell'],['Partecipante','person-cell'],['‰','weight-cell'],['Appello / presenza','presence-cell'],['Delega a','delegate-cell']])header.div(label,{class:cls,role:'columnheader'});
    for(const p of people){
        const row=root.div({class:'^people.'+p.id+'.rowClass',id:'person-row-'+p.id,hidden:'^people.'+p.id+'.filtered',role:'row'});
        row.div(p.unit??'—',{class:'unit-cell',role:'cell'});row.div(p.name,{class:'person-cell',role:'rowheader'});row.div(String(p.weight),{class:'weight-cell',role:'cell'});
        const cell=row.div({class:'presence-cell',role:'cell'}),status=cell.div({class:'presence-status'});status.span({id:'presence-led-'+p.id,class:'^people.'+p.id+'.ledClass','aria-hidden':'true'});status.span('^people.'+p.id+'.status',{id:'presence-'+p.id,class:'person-status'});
        const actions=cell.div({class:'mini-actions'});
        button(actions,'^people.'+p.id+'.button','presence','toggle-'+p.id,{person:p.id},{disabled:'^rosterLocked','aria-label':'Cambia presenza di '+p.name,title:'Registra ingresso o uscita'});
        button(actions,'−','markAbsent','absent-'+p.id,{person:p.id},{disabled:'^rosterLocked','aria-label':'Segna assente '+p.name,title:'Appello: conferma assenza'});
        const proxy=row.div({class:'delegate-cell',role:'cell'}),select=proxy.select({id:'delegate-'+p.id,value:'^delegates.'+p.id,disabled:'^people.'+p.id+'.delegateLocked','aria-label':'Delega di '+p.name});
        select.dataController({func:'delegateChanged',delegate:'^delegates.'+p.id});
        select.option('Nessuna',{value:''});for(const other of people)if(other.id!==p.id)select.option(other.name,{value:other.id,disabled:'^people.'+other.id+'.notPresent'});
        button(proxy,'✓ Conferma','delegate','apply-'+p.id,{person:p.id,delegate:'=delegates.'+p.id},{disabled:'^people.'+p.id+'.delegateSaveLocked','aria-label':'Conferma delega di '+p.name,title:'Conferma o revoca la delega'});
    }
}
export function drawer(root,people){
    for(const p of people){const row=root.div({class:'drawer-person'}),name=row.div({class:'grow'});name.strong(`${p.unit??'—'} · ${p.name}`);const status=name.div({class:'presence-status'});status.span({id:'drawer-led-'+p.id,class:'^people.'+p.id+'.ledClass','aria-hidden':'true'});status.span('^people.'+p.id+'.status',{class:'muted'});row.span(String(p.weight),{class:'weight'});}
}
export function agendaRows(root,items){
    for(const item of items){
        const row=root.div({class:'agenda-row',id:'agenda-row-'+item.id,dropTarget:'^agendaCanDrag',dropTypes:'text/x-assembly-agenda',dropEffect:'move',dropTargetCb:'allowAgendaDrop',onDrop:'dropAgenda'});
        button(row,'⠿','pickAgenda','agenda-drag-'+item.id,{agenda:item.id},{class:'^agenda.'+item.id+'.handleClass',disabled:'^agendaMoveLocked',draggable:'^agendaCanDrag',onDrag:'dragAgenda',effectAllowed:'move',title:'Trascina o seleziona per spostare','aria-label':'Sposta punto '+item.position});
        row.span(String(item.position).padStart(2,'0'),{class:'item-number'});
        const title=row.div({class:'grow'});
        title.input({value:'^agendaDraft.'+item.id,id:'agenda-title-'+item.id,maxlength:120,readonly:'^agenda.'+item.id+'.titleLocked','aria-label':'Titolo punto '+item.position})
            .dataController({func:'agendaChanged',value:'^agendaDraft.'+item.id});
        title.p('^agenda.'+item.id+'.status',{class:'muted'});
        button(row,'Apri →','selectAgenda','agenda-'+item.id,{agenda:item.id},{disabled:'^agenda.'+item.id+'.openLocked','aria-label':'Apri punto '+item.position});
    }
}
export function agendaOptions(root,items){for(const item of items)root.option(`${item.position}. ${item.title}`,{value:item.id});}
export function votes(root,people,votes,groups){
    // Membership and weights come from the ballot's frozen vote records, never current proxies.
    for(const representative of people){
        const group=groups.find(g=>g.representative_id===representative.id);if(!group)continue;
        const block=root.section({class:'voter-group',id:'voter-group-'+representative.id,'aria-labelledby':'voter-heading-'+representative.id});
        const head=block.div({class:'voter-heading'}),who=head.div({class:'grow'});
        who.h3('Vota '+representative.name,{id:'voter-heading-'+representative.id});
        const own=votes.some(v=>v.representative_id===representative.id&&v.person_id===representative.id);
        who.p(`${own?'Per sé'+(group.delegates?' e ':''):''}${group.delegates?group.delegates+(group.delegates===1?' delega':' deleghe'):''} · ${group.represented} ${group.represented===1?'soggetto':'soggetti'} · ${group.weight} ‰`,{class:'muted',id:'voter-summary-'+representative.id});
        head.span('^voterGroups.'+representative.id+'.progress',{class:'voter-progress',id:'voter-progress-'+representative.id,role:'status'});
        const members=[representative,...people.filter(p=>p.id!==representative.id)];
        for(const p of members){
            if(!votes.some(v=>v.representative_id===representative.id&&v.person_id===p.id))continue;
            const row=block.div({class:'vote-row',id:'vote-row-'+p.id}),subject=row.div({class:'grow'});
            subject.strong('Per '+p.name);subject.span('^votes.'+p.id+'.detail',{class:'muted'});
            const buttons=row.div({class:'vote-buttons'});
            for(const [key,label,name]of [['yes','👍 Sì','Favorevole'],['no','👎 No','Contrario'],['abstain','➖ Astenuto','Astenuto']])button(buttons,label,'vote','vote-'+p.id+'-'+key,{person:p.id,choice:key},{class:'^votes.'+p.id+'.'+key,disabled:'^voteLocked','aria-label':name+' per '+p.name+' · vota '+representative.name,'aria-pressed':'^votes.'+p.id+'.'+key+'Pressed'});
            row.span('^votes.'+p.id+'.choice',{id:'choice-'+p.id,class:'choice'});
        }
    }
}
export function documents(root,docs,prefix){
    if(!docs.length){root.p('Nessun documento allegato a questo punto.',{class:'muted'});return;}
    for(const doc of docs){const row=root.div({class:'document-row'}),title=row.div({class:'grow'});title.strong(doc.title);title.p(`${doc.supplier} · ${(doc.total_cents/100).toLocaleString('it-IT',{style:'currency',currency:'EUR'})}`,{class:'muted'});
        button(row,'📄 Apri','openDocument',`${prefix}-${doc.id}`,{document:doc.id},{'aria-label':'Apri '+doc.title});}
}

export function speakers(root,people){
    root.html_label('Chi interviene',{for:'intervention-speaker'});
    const select=root.select({id:'intervention-speaker',value:'^interventionSpeaker',disabled:'^editorLocked','aria-label':'Chi interviene'});
    select.option('Seleziona un partecipante…',{value:''});
    for(const person of people)select.option(`${person.name} · ${person.unit??'—'}`,{value:person.id});
    select.dataController({func:'updateLocks',speaker:'^interventionSpeaker'});
}
export function interventions(root,rows){
    if(!rows.length){root.p('Nessun intervento registrato per questo punto.',{class:'muted'});return;}
    for(const speech of rows){
        const row=root.div({class:'intervention-row',id:'intervention-'+speech.id}),body=row.div({class:'grow'});
        body.strong(`${speech.position}. ${speech.speaker}`);body.span(speech.time,{class:'intervention-time',id:'intervention-time-'+speech.id});body.p(speech.excerpt,{class:'intervention-excerpt'});
        const actions=row.div({class:'intervention-actions'});actions.span('^interventions.'+speech.id+'.status',{id:'intervention-status-'+speech.id,class:'muted'});
        button(actions,'📥','copyInterventions','intervention-copy-'+speech.id,{intervention:speech.id},{disabled:'^interventions.'+speech.id+'.copyLocked',title:'Riporta nel verbale','aria-label':'Riporta intervento '+speech.position+' di '+speech.speaker});
    }
}
