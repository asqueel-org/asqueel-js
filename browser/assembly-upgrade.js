import seed from '../examples/assembly-seed.json' with {type:'json'};
import {readTransfer} from '../src/transfer.js';
import {migrateSQLite} from '../src/sqlite.js';

/** Add demo schema/data without rewriting an assembly already in use. */
export async function upgradeAssembly(db,builder) {
    if(builder.resolve().tables.get('assembly.intervention')?.columns.get('recorded_at'))return null;
    const updated=readTransfer(seed.bundle);
    await migrateSQLite(db,updated.toMigration());
    if(builder.resolve().tables.has('assembly.document'))return updated;
    await updated.queries(db).transaction(async tx=>{
        const existing=await tx.execute(seed.reads.agenda),ballots=await tx.execute(seed.reads.ballots),people=await tx.execute(seed.reads.people);
        const pristine=!ballots.length&&!people.some(p=>p.present||p.delegate_id)&&!existing.some(a=>a.discussion||a.minutes||a.completed);
        const active=ballots.find(b=>!b.closed),visible=ballots.filter(b=>b.closed).slice(active?-2:-3);
        if(active)visible.push(active);
        for(const [index,item] of seed.initial.agenda.entries()) {
            if(existing.some(row=>row.id===item.id))continue;
            const ballot=visible[index];
            await tx.execute({operation:'insert',table:'assembly.agenda',values:{...item,title:ballot?.title??item.title,ballot_id:ballot?.id??null}});
        }
        for(const person of seed.initial.people){
            const old=people.find(p=>p.id===person.id);
            if(pristine){
                const {represented_by,represented_weight,...values}=person;
                await tx.execute({operation:old?'update':'insert',table:'assembly.person',values});
            }else if(old){
                await tx.execute({operation:'update',table:'assembly.person',values:{id:old.id,unit:old.unit??person.unit,email:old.email??person.email,called:old.called??!!(old.present||old.delegate_id)}});
            }
        }
        const agenda=await tx.execute(seed.reads.agenda),docs=await tx.execute(seed.reads.documents);
        for(const doc of seed.initial.documents){
            if(docs.some(d=>d.id===doc.id))continue;
            if(agenda.find(a=>a.id===doc.agenda_id)?.title!==seed.initial.agenda.find(a=>a.id===doc.agenda_id)?.title)continue;
            await tx.execute({operation:'insert',table:'assembly.document',values:doc});
        }
    });
    return updated;
}
