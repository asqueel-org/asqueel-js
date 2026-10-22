import test from 'node:test';
import assert from 'node:assert/strict';
import oracle from './fixtures/assembly.json' with {type:'json'};
import {nativeSQLite} from './native-sqlite.js';
import {importTransfer,exportTransfer} from '../src/transfer.js';
import {transferSnapshot} from './transfer-runner.js';
import {Assembly} from '../browser/assembly-domain.js';

test('assembly: Python model, SQL, parameters, rules, frozen rosters and calculations',{timeout:60000},async()=>{
    const db=nativeSQLite();
    try {
        const {builder}=await importTransfer(db,oracle.bundle),app=new Assembly(builder,db);
        assert.deepEqual(await transferSnapshot(db,builder),oracle.before);
        assert.deepEqual(await app.view(),oracle.initial);
        for (const step of oracle.steps) {
            let view;
            if(step.error){await assert.rejects(app.action(step.action),{message:step.error});app.trace=[];view=await app.view();}
            else view=await app.action(step.action);
            assert.deepEqual(view,step.view,JSON.stringify(step.action));
            assert.deepEqual(app.trace,step.trace,'SQL/params/results: '+JSON.stringify(step.action));
        }
        assert.deepEqual(await transferSnapshot(db,builder),oracle.after);
        const totals=(await app.view()).totals;
        assert.deepEqual(totals.map(t=>[t.weight,t.yes,t.no,t.abstain]),[[215,110,55,50],[255,90,120,45],[420,65,0,0]]);
        const returned=await exportTransfer(db,builder),copy=nativeSQLite();
        try {const {builder:b}=await importTransfer(copy,returned);assert.deepEqual(await transferSnapshot(copy,b),oracle.after);}
        finally {await copy.close();}
    } finally {await db.close();}
});

test('opening a ballot rolls back both header and partial roster after a storage failure',async()=>{
    const db=nativeSQLite();
    try {
        const {builder}=await importTransfer(db,oracle.bundle),app=new Assembly(builder,db);
        await app.action({kind:'presence',person:'p1',present:true});
        await app.action({kind:'presence',person:'p2',present:true});
        const before=await app.view();let writes=0;
        const failing={...db,query:async(sql,params)=>{
            if(sql.startsWith('INSERT')&&sql.includes('assembly_vote')&&++writes===2)throw new Error('SIMULATED_STORAGE_FAILURE');
            return db.query(sql,params);
        }};
        await assert.rejects(new Assembly(builder,failing).action({kind:'open',id:'b1',title:'Atomicità'}),{message:'SIMULATED_STORAGE_FAILURE'});
        assert.equal(writes,2);assert.deepEqual(await app.view(),before);
        const retried=await app.action({kind:'open',id:'b1',title:'Atomicità'});
        assert.equal(retried.ballots.length,1);assert.equal(retried.votes.length,2);
    }finally{await db.close();}
});

test('existing assembly upgrades without losing ballots, votes or participants; retry is idempotent',async()=>{
    const {default:legacy}=await import('./fixtures/assembly-v1.json',{with:{type:'json'}});
    const {upgradeAssembly}=await import('../browser/assembly-upgrade.js');
    const {migrateSQLite}=await import('../src/sqlite.js');
    const {readTransfer}=await import('../src/transfer.js');
    const db=nativeSQLite();
    try{
        const {builder}=await importTransfer(db,legacy),q=builder.queries(db);
        await q.execute({operation:'update',table:'assembly.person',values:{id:'p1',present:true}});
        await q.execute({operation:'insert',table:'assembly.ballot',values:{id:'b1',title:'Argomento già registrato',closed:false}});
        await q.execute({operation:'insert',table:'assembly.vote',values:{id:'b1_p1',ballot_id:'b1',person_id:'p1',representative_id:'p1',weight:250,choice:'yes'}});
        const before=await exportTransfer(db,builder);
        // Simulate a restart after DDL but before seed/metadata have been committed.
        await migrateSQLite(db,readTransfer(oracle.bundle).toMigration());
        const upgraded=await upgradeAssembly(db,builder),after=await exportTransfer(db,upgraded);
        const {fromTytx}=await import('@genrojs/tytx');
        for(const [table,text]of Object.entries(before.data)){
            const oldRows=text.trim().split('\n').filter(Boolean).map(line=>fromTytx(line)),newRows=after.data[table].trim().split('\n').filter(Boolean).map(line=>fromTytx(line));
            assert.equal(newRows.length,oldRows.length,table);
            for(const row of oldRows){const next=newRows.find(r=>r.id===row.id);assert.deepEqual(Object.fromEntries(Object.keys(row).map(k=>[k,next[k]])),row,table);}
        }
        const app=new Assembly(upgraded,db),view=await app.view();
        assert.equal(view.agenda[0].title,'Argomento già registrato');assert.equal(view.agenda[0].ballot_id,'b1');
        assert.equal(view.totals[0].yes,250);assert.equal(view.agenda.length,5);
        await upgradeAssembly(db,builder);assert.deepEqual(await exportTransfer(db,upgraded),after);
        assert.equal(await upgradeAssembly(db,upgraded),null);
    }finally{await db.close();}
});


test('upgrade keeps a fourth legacy ballot reachable while retaining all history',async()=>{
    const {default:legacy}=await import('./fixtures/assembly-v1.json',{with:{type:'json'}});
    const {upgradeAssembly}=await import('../browser/assembly-upgrade.js');
    const db=nativeSQLite();
    try{
        const {builder}=await importTransfer(db,legacy),q=builder.queries(db);
        for(let i=1;i<=4;i++){
            await q.execute({operation:'insert',table:'assembly.ballot',values:{id:`b${i}`,title:`Vecchio punto ${i}`,closed:i<4}});
            await q.execute({operation:'insert',table:'assembly.vote',values:{id:`b${i}_p1`,ballot_id:`b${i}`,person_id:'p1',representative_id:'p1',weight:250,choice:'yes'}});
        }
        const updated=await upgradeAssembly(db,builder),app=new Assembly(updated,db),view=await app.view();
        assert.equal(view.ballots.length,4);assert.equal(view.agenda[2].ballot_id,'b4');
        await app.action({kind:'close',ballot:view.agenda[2].ballot_id});
        assert.ok((await app.view()).ballots.every(b=>b.closed));
    }finally{await db.close();}
});

test('untouched legacy demo becomes the complete 24-person Python example',async()=>{
    const {default:legacy}=await import('./fixtures/assembly-v1.json',{with:{type:'json'}});
    const {upgradeAssembly}=await import('../browser/assembly-upgrade.js');
    const db=nativeSQLite();
    try{
        const {builder}=await importTransfer(db,legacy),updated=await upgradeAssembly(db,builder);
        assert.deepEqual(await new Assembly(updated,db).view(),oracle.initial);
        assert.deepEqual(await transferSnapshot(db,updated),oracle.before);
    }finally{await db.close();}
});

test('reordering rolls back both positions after the second write fails',async()=>{
    const db=nativeSQLite();
    try{
        const {builder}=await importTransfer(db,oracle.bundle),before=await new Assembly(builder,db).view();let writes=0;
        const failing={...db,query:async(sql,params)=>{
            if(sql.startsWith('UPDATE')&&sql.includes('assembly_agenda')&&++writes===2)throw Error('REORDER_FAILURE');
            return db.query(sql,params);
        }};
        await assert.rejects(new Assembly(builder,failing).action({kind:'agenda_move',agenda:'a2',direction:-1}),{message:'REORDER_FAILURE'});
        assert.equal(writes,2);assert.deepEqual(await new Assembly(builder,db).view(),before);
    }finally{await db.close();}
});

test('the previous agenda-enabled workspace keeps edited points, notes and original weights',async()=>{
    const {default:legacy}=await import('./fixtures/assembly-v2.json',{with:{type:'json'}});
    const {upgradeAssembly}=await import('../browser/assembly-upgrade.js');const db=nativeSQLite();
    try{
        const {builder}=await importTransfer(db,legacy),q=builder.queries(db);
        await q.execute({operation:'update',table:'assembly.agenda',values:{id:'a1',title:'Argomento personalizzato',discussion:'Annotazione già salvata',minutes:'Bozza precedente'}});
        const updated=await upgradeAssembly(db,builder),view=await new Assembly(updated,db).view();
        assert.equal(view.people.length,6);assert.equal(view.attendance.total,1000);
        assert.equal(view.people[0].weight,250);assert.equal(view.agenda[0].title,'Argomento personalizzato');
        assert.equal(view.agenda[0].discussion,'Annotazione già salvata');assert.equal(view.agenda[0].minutes,'Bozza precedente');
        assert.ok(view.documents.every(d=>d.agenda_id!=='a1'),'Do not attach a budget to a renamed legacy topic');
        assert.equal(await upgradeAssembly(db,updated),null);
    }finally{await db.close();}
});

test('agenda draft commit rolls back edits, insertion and order together after a storage failure',async()=>{
    const db=nativeSQLite();
    try{
        const {builder}=await importTransfer(db,oracle.bundle),app=new Assembly(builder,db),before=await app.view();
        const base=before.agenda.map(({id,title})=>({id,title}));
        const items=[{id:'a6',title:'Nuovo argomento'},...base.map(x=>({...x,title:x.id==='a1'?'Titolo aggiornato':x.title}))];
        let writes=0;
        const failing={...db,query:async(sql,params)=>{
            if(/^(INSERT|UPDATE)/.test(sql)&&sql.includes('assembly_agenda')&&++writes===3)throw Error('AGENDA_STORAGE_FAILURE');
            return db.query(sql,params);
        }};
        await assert.rejects(new Assembly(builder,failing).action({kind:'agenda_save',base,items}),{message:'AGENDA_STORAGE_FAILURE'});
        assert.equal(writes,3);assert.deepEqual(await app.view(),before);
        assert.deepEqual((await app.action({kind:'agenda_save',base,items})).agenda.map(({id,title})=>({id,title})),items);
        await assert.rejects(app.action({kind:'agenda_save',base,items}),{message:'AGENDA_MODIFICATA'});
    }finally{await db.close();}
});

test('batch editing rechecks ballot restrictions and preserves independent discussion changes',async()=>{
    const db=nativeSQLite();
    try{
        const {builder}=await importTransfer(db,oracle.bundle),app=new Assembly(builder,db);
        const base=(await app.view()).agenda.map(({id,title})=>({id,title}));
        await app.action({kind:'notes',agenda:'a1',discussion:'Nota salvata da un’altra finestra',minutes:''});
        await app.action({kind:'presence',person:'p1',present:true});
        await app.action({kind:'open',id:'b1',agenda:'a1'});
        await assert.rejects(app.action({kind:'agenda_save',base,items:base.map(x=>({...x,title:x.id==='a1'?'Nuovo titolo':x.title}))}),{message:'ARGOMENTO_VOTATO'});
        await assert.rejects(app.action({kind:'agenda_save',base,items:[base[1],base[0],...base.slice(2)]}),{message:'VOTAZIONE_APERTA'});
        const after=await app.action({kind:'agenda_save',base,items:base.map(x=>({...x,title:x.id==='a2'?'Altro punto aggiornato':x.title}))});
        assert.equal(after.agenda[0].discussion,'Nota salvata da un’altra finestra');assert.equal(after.agenda[0].ballot_id,'b1');
    }finally{await db.close();}
});

test('single-field note saves preserve the other text and reject stale versions and completed items',async()=>{
    const db=nativeSQLite();
    try{
        const {builder}=await importTransfer(db,oracle.bundle),app=new Assembly(builder,db);
        await app.action({kind:'note_save',agenda:'a1',field:'minutes',base:'',value:'Verbale indipendente'});
        const after=await app.action({kind:'note_save',agenda:'a1',field:'discussion',base:'',value:'Discussione locale'});
        assert.equal(after.agenda[0].minutes,'Verbale indipendente');
        await assert.rejects(app.action({kind:'note_save',agenda:'a1',field:'minutes',base:'',value:'Bozza obsoleta'}),{message:'NOTA_MODIFICATA'});
        await assert.rejects(app.action({kind:'note_save',agenda:'a1',field:'discussion',base:'Discussione locale',value:'x'.repeat(20001)}),{message:'TESTO_NON_VALIDO'});
        assert.deepEqual(await app.view(),after);
        await app.action({kind:'complete',agenda:'a1'});
        await assert.rejects(app.action({kind:'note_save',agenda:'a1',field:'discussion',base:'Discussione locale',value:'Modifica finale'}),{message:'PUNTO_CONCLUSO'});
    }finally{await db.close();}
});

test('intervention upgrade preserves the existing 24-person workspace and retries safely',async()=>{
    const {default:legacy}=await import('./fixtures/assembly-v3.json',{with:{type:'json'}});
    const {upgradeAssembly}=await import('../browser/assembly-upgrade.js');
    const db=nativeSQLite();
    try{
        const {builder}=await importTransfer(db,legacy),q=builder.queries(db);
        await q.execute({operation:'update',table:'assembly.agenda',values:{id:'a1',discussion:'Discussione esistente',minutes:'Verbale esistente'}});
        await q.execute({operation:'update',table:'assembly.person',values:{id:'p1',present:true}});
        const before=await exportTransfer(db,builder),updated=await upgradeAssembly(db,builder),after=await exportTransfer(db,updated);
        for(const [table,data]of Object.entries(before.data))assert.equal(after.data[table],data,table);
        assert.deepEqual((await new Assembly(updated,db).view()).interventions,[]);
        await upgradeAssembly(db,builder);assert.deepEqual(await exportTransfer(db,updated),after);
        assert.equal(await upgradeAssembly(db,updated),null);
    }finally{await db.close();}
});

test('intervention registration and minutes inclusion roll back atomically on storage failure',async()=>{
    const db=nativeSQLite();
    try{
        const {builder}=await importTransfer(db,oracle.bundle),app=new Assembly(builder,db),before=await app.view();
        const action={kind:'intervention_add',recorded_at:'2026-10-22T18:00:00.000Z',id:'i1',agenda:'a1',person:'p1',base:'',text:'<p>Proposta di Anna.</p>'};
        let failed=false;
        const failDiscussion={...db,query:async(sql,params)=>{
            if(sql.startsWith('UPDATE')&&sql.includes('assembly_agenda')){failed=true;throw Error('DISCUSSION_FAILURE');}
            return db.query(sql,params);
        }};
        await assert.rejects(new Assembly(builder,failDiscussion).action(action),{message:'DISCUSSION_FAILURE'});
        assert.ok(failed);assert.deepEqual(await app.view(),before);
        const registered=await app.action(action);failed=false;
        const failInclusion={...db,query:async(sql,params)=>{
            if(sql.startsWith('UPDATE')&&sql.includes('assembly_intervention')){failed=true;throw Error('INCLUSION_FAILURE');}
            return db.query(sql,params);
        }};
        const save={kind:'note_save',agenda:'a1',field:'minutes',base:'',value:'<p>Anna propone…</p>',interventions:['i1']};
        await assert.rejects(new Assembly(builder,failInclusion).action(save),{message:'INCLUSION_FAILURE'});
        assert.ok(failed);assert.deepEqual(await app.view(),registered);
        const saved=await app.action(save);assert.equal(saved.agenda[0].minutes,save.value);assert.ok(saved.interventions[0].included);
    }finally{await db.close();}
});

test('adding intervention timestamps preserves old entries without inventing an hour',async()=>{
    const {default:legacy}=await import('./fixtures/assembly-v4.json',{with:{type:'json'}});
    const {upgradeAssembly}=await import('../browser/assembly-upgrade.js');const db=nativeSQLite();
    try{
        const {builder}=await importTransfer(db,legacy);
        await builder.queries(db).execute({operation:'insert',table:'assembly.intervention',values:{id:'i1',agenda_id:'a1',person_id:'p1',position:1,speaker:'Anna Rossi',text:'Intervento precedente',included:true}});
        const updated=await upgradeAssembly(db,builder),view=await new Assembly(updated,db).view();
        assert.deepEqual(view.interventions[0],{id:'i1',agenda_id:'a1',person_id:'p1',position:1,speaker:'Anna Rossi',text:'Intervento precedente',included:1,recorded_at:null});
        await upgradeAssembly(db,builder);assert.deepEqual(await new Assembly(updated,db).view(),view);
        assert.equal(await upgradeAssembly(db,updated),null);
    }finally{await db.close();}
});
