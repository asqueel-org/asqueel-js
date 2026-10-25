import {hasMinutesText} from './assembly-text.js';
import seed from '../examples/assembly-seed.json' with {type:'json'};

/** Small application layer: direct proxies, one vote per subject, frozen ballot roster. */
export class Assembly {
    constructor(builder, adapter) { this.queries=builder.queries(adapter);this.trace=[]; }
    async run(request) {
        const compiled=this.queries.compile(request), rows=await this.queries.execute(request);
        this.trace.push({request,compiled,rows});return rows;
    }
    async view() {
        const result={};
        for (const [name,request] of Object.entries(seed.reads)) result[name]=await this.run(request);
        result.attendance=result.attendance[0];
        for (const ballot of result.ballots) {
            const total=result.totals.find(t=>t.ballot_id===ballot.id);
            ballot.result=!ballot.closed?'in_corso':total.yes*2>total.weight?'approvata_demo':'respinta_demo';
        }
        return result;
    }
    write(table,operation,values) {return this.run({operation,table:'assembly.'+table,values});}
    async action(a) {
        this.trace=[];
        const base=this.queries;
        try {
            await base.transaction(async tx=>{
                this.queries=tx;
                const state=await this.view(),people=new Map(state.people.map(p=>[p.id,p]));
                const active=state.ballots.find(b=>!b.closed), fail=code=>{throw new Error(code);};
                if (['presence','delegate'].includes(a.kind)) {
                    if (active) fail('VOTAZIONE_APERTA');
                    const p=people.get(a.person);if(!p) fail('PERSONA_SCONOSCIUTA');
                    if(a.kind==='presence') {
                        if(typeof a.present!=='boolean') fail('PRESENZA_NON_VALIDA');
                        if(a.present && p.delegate_id) fail('RIMUOVERE_DELEGA');
                        await this.write('person','update',{id:p.id,present:a.present,called:true});
                    } else {
                        const target=a.delegate??null;
                        if(target!==null && (p.present || target===p.id || !people.get(target)?.present)) fail('DELEGA_NON_VALIDA');
                        await this.write('person','update',{id:p.id,delegate_id:target,called:true});
                    }
                } else if(a.kind==='agenda_save') {
                    // Optimistic comparison and validation precede every write. Notes/votes are never overwritten.
                    const current=state.agenda,base=a.base,items=a.items;
                    if(!Array.isArray(base)||base.length!==current.length||base.some((x,i)=>!x||x.id!==current[i].id||x.title!==current[i].title))fail('AGENDA_MODIFICATA');
                    if(!Array.isArray(items)||items.length<current.length||items.some(x=>!x||typeof x.id!=='string')||new Set(items.map(x=>x.id)).size!==items.length)fail('AGENDA_NON_VALIDA');
                    const expected=new Set([...current.map(x=>x.id),...Array.from({length:items.length-current.length},(_,i)=>`a${current.length+i+1}`)]);
                    if(items.some(x=>!expected.has(x.id)))fail('AGENDA_NON_VALIDA');
                    const changes=items.map((x,i)=>{
                        if(typeof x.title!=='string'||!x.title.trim()||[...x.title.trim()].length>120)fail('TITOLO_NON_VALIDO');
                        const title=x.title.trim(),position=i+1,old=current.find(y=>y.id===x.id);
                        if(old&&(old.completed||old.ballot_id)&&title!==old.title)fail('ARGOMENTO_VOTATO');
                        if(active&&old&&old.position!==position)fail('VOTAZIONE_APERTA');
                        return {id:x.id,title,position,old};
                    });
                    for(const {id,title,position,old} of changes){
                        if(!old)await this.write('agenda','insert',{id,position,title,discussion:'',minutes:'',completed:false});
                        else if(title!==old.title||position!==old.position)await this.write('agenda','update',{id,position,title});
                    }
                } else if(['agenda_add','agenda_edit','agenda_move'].includes(a.kind)) {
                    if(a.kind==='agenda_add') {
                        const title=(a.title??'').trim(),id=`a${state.agenda.length+1}`;
                        if(!title||title.length>120)fail('TITOLO_NON_VALIDO');
                        if(a.id!==id)fail('PUNTO_NON_VALIDO');
                        await this.write('agenda','insert',{id,position:state.agenda.length+1,title,discussion:'',minutes:'',completed:false});
                    } else {
                        const item=state.agenda.find(x=>x.id===a.agenda);
                        if(!item)fail('PUNTO_NON_VALIDO');
                        if(a.kind==='agenda_edit') {
                            if(item.completed||item.ballot_id)fail('ARGOMENTO_VOTATO');
                            const title=(a.title??'').trim();
                            if(!title||title.length>120)fail('TITOLO_NON_VALIDO');
                            await this.write('agenda','update',{id:item.id,title});
                        } else {
                            if(active)fail('VOTAZIONE_APERTA');
                            if(![-1,1].includes(a.direction))fail('ORDINE_NON_VALIDO');
                            const other=state.agenda.find(x=>x.position===item.position+a.direction);
                            if(!other)fail('ORDINE_NON_VALIDO');
                            await this.write('agenda','update',{id:item.id,position:other.position});
                            await this.write('agenda','update',{id:other.id,position:item.position});
                        }
                    }
                } else if(a.kind==='intervention_add') {
                    const item=state.agenda.find(x=>x.id===a.agenda);
                    if(!item)fail('PUNTO_NON_VALIDO');
                    if(item.completed)fail('PUNTO_CONCLUSO');
                    const person=people.get(a.person),administrator=a.administrator===undefined?false:a.administrator;
                    if(typeof administrator!=='boolean'||(administrator&&a.person!=null))fail('INTERVENTO_NON_VALIDO');
                    if(!administrator&&!person)fail('PERSONA_SCONOSCIUTA');
                    if(typeof a.text!=='string'||[...a.text].length>20000||!hasMinutesText(a.text))fail('TESTO_NON_VALIDO');
                    if(item.discussion!==a.base)fail('NOTA_MODIFICATA');
                    if(a.id!==`i${state.interventions.length+1}`)fail('INTERVENTO_NON_VALIDO');
                    const recorded=a.recorded_at;
                    if(typeof recorded!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(recorded)||!Number.isFinite(Date.parse(recorded))||new Date(recorded).toISOString()!==recorded)fail('ORARIO_NON_VALIDO');
                    const position=1+state.interventions.filter(x=>x.agenda_id===item.id).length;
                    await this.write('intervention','insert',{id:a.id,agenda_id:item.id,person_id:administrator?null:person.id,position,speaker:administrator?'Amministratore':person.name,text:a.text,included:false,recorded_at:recorded});
                    await this.write('agenda','update',{id:item.id,discussion:a.text});
                } else if(a.kind==='note_save') {
                    const item=state.agenda.find(x=>x.id===a.agenda);
                    if(!item)fail('PUNTO_NON_VALIDO');
                    if(item.completed)fail('PUNTO_CONCLUSO');
                    if(!['discussion','minutes'].includes(a.field)||typeof a.value!=='string'||[...a.value].length>20000||typeof a.base!=='string')fail('TESTO_NON_VALIDO');
                    if(item[a.field]!==a.base)fail('NOTA_MODIFICATA');
                    const ids=a.interventions===undefined?[]:a.interventions;
                    if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length||(ids.length&&a.field!=='minutes'))fail('INTERVENTO_NON_VALIDO');
                    const rows=ids.map(id=>state.interventions.find(x=>x.id===id&&x.agenda_id===item.id&&!x.included));
                    if(rows.some(x=>!x))fail('INTERVENTO_NON_VALIDO');
                    await this.write('agenda','update',{id:item.id,[a.field]:a.value});
                    for(const row of rows)await this.write('intervention','update',{id:row.id,included:true});
                } else if(['notes','complete'].includes(a.kind)) {
                    const item=state.agenda.find(x=>x.id===a.agenda);
                    if(!item) fail('PUNTO_NON_VALIDO');
                    if(item.completed) fail('PUNTO_CONCLUSO');
                    if(a.kind==='notes') {
                        if(['discussion','minutes'].some(k=>typeof a[k]!=='string'||a[k].length>20000)) fail('TESTO_NON_VALIDO');
                        await this.write('agenda','update',{id:item.id,discussion:a.discussion,minutes:a.minutes});
                    } else {
                        const ballot=state.ballots.find(b=>b.id===item.ballot_id);
                        if(ballot&&!ballot.closed) fail('VOTAZIONE_APERTA');
                        if(!hasMinutesText(item.minutes)) fail('VERBALE_MANCANTE');
                        await this.write('agenda','update',{id:item.id,completed:true});
                    }
                } else if(a.kind==='open') {
                    if(active) fail('VOTAZIONE_APERTA');
                    const item=state.agenda.find(x=>x.id===a.agenda);
                    if(a.agenda&&(!item||item.completed||item.ballot_id)) fail('PUNTO_NON_VALIDO');
                    const title=item?item.title:(a.title??'').trim(),key=a.id;
                    if(!title || title.length>120 || key!==`b${state.ballots.length+1}`) fail('VOTAZIONE_NON_VALIDA');
                    const voters=state.people.filter(p=>p.represented_by);
                    if(!voters.length) fail('NESSUN_RAPPRESENTATO');
                    await this.write('ballot','insert',{id:key,title,closed:false});
                    if(item) await this.write('agenda','update',{id:item.id,ballot_id:key});
                    for(const p of voters) await this.write('vote','insert',{id:`${key}_${p.id}`,ballot_id:key,person_id:p.id,representative_id:p.represented_by,weight:p.weight});
                } else if(['vote','close'].includes(a.kind)) {
                    if(!active || active.id!==a.ballot) fail('VOTAZIONE_NON_APERTA');
                    if(a.kind==='vote') {
                        const v=state.votes.find(v=>v.ballot_id===active.id && v.person_id===a.person);
                        if(!v || !['yes','no','abstain'].includes(a.choice)) fail('VOTO_NON_VALIDO');
                        await this.write('vote','update',{id:v.id,choice:a.choice});
                    } else {
                        if(state.totals.find(t=>t.ballot_id===active.id).pending) fail('VOTI_MANCANTI');
                        await this.write('ballot','update',{id:active.id,closed:true});
                    }
                } else fail('AZIONE_SCONOSCIUTA');
            });
        } finally {this.queries=base;}
        return this.view();
    }
}
