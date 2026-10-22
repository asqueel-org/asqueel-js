import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,copyFile,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import oracle from '../fixtures/assembly.json' with {type:'json'};
const snapshot=page=>page.evaluate(()=>JSON.parse(window.gramlot.data.getItem('snapshot')));
const compare=(a,b)=>{for(const k of ['model','migration','structure','rows'])expect(a[k],k).toEqual(b[k]);};
const noteInput=(page,field='minutes')=>page.locator(field==='minutes'?'#minutes-text':'#discussion');
const fillMinutes=(page,html)=>fillNote(page,html,'minutes');
async function fillNote(page,text,field='discussion'){
    await noteInput(page,field).fill(text);
    await page.locator('#'+field+'-lock').getByRole('button').focus();
}
async function chooseItem(page,id,step){
    await page.getByRole('tab',{name:/Ordine del giorno/}).click();
    await page.locator('#agenda-'+id).click();
    await expect(page.locator('#work-stack')).toBeVisible();
    await page.locator('#step-'+step).click();
}
async function comparePresenceLeds(page,view){
    const expected=view.people.map(p=>p.present?'led-present':p.delegate_id?'led-delegated':'led-absent');
    for(const prefix of ['presence-led-','drawer-led-'])await expect.poll(()=>page.evaluate(({prefix,ids})=>ids.map(id=>document.getElementById(prefix+id)?.className.split(' ').find(c=>c.startsWith('led-'))),{prefix,ids:view.people.map(p=>p.id)})).toEqual(expected);
}
async function compareVoterGroups(page,view,ballot){
    const groups=view.voter_groups.filter(g=>g.ballot_id===ballot),votes=view.votes.filter(v=>v.ballot_id===ballot);
    await expect(page.locator('[id^="voter-group-"]')).toHaveCount(groups.length);
    const names=Object.fromEntries(view.people.map(p=>[p.id,p.name])),choices={yes:'Favorevole',no:'Contrario',abstain:'Astenuto'};
    for(const group of groups){
        const block=page.locator('#voter-group-'+group.representative_id),members=votes.filter(v=>v.representative_id===group.representative_id);
        await expect(block.locator('h3')).toHaveText('Vota '+names[group.representative_id]);
        await expect(block.locator('[id^="vote-row-"]')).toHaveCount(group.represented);
        await expect(block.locator('[id^="voter-summary-"]')).toContainText(group.weight+' ‰');
        if(group.delegates)await expect(block.locator('[id^="voter-summary-"]')).toContainText(group.delegates+(group.delegates===1?' delega':' deleghe'));
        await expect(block.locator('[id^="voter-progress-"]')).toContainText(`${group.represented-group.pending} / ${group.represented} registrati`);
        for(const vote of members){
            const row=block.locator('#vote-row-'+vote.person_id);await expect(row.locator('strong')).toHaveText('Per '+names[vote.person_id]);
            await expect(row).toContainText(vote.weight+' ‰');await expect(row.locator('#choice-'+vote.person_id)).toHaveText(choices[vote.choice]??'Da registrare');
        }
    }
}
async function execute(page,a){
    if(['presence','delegate'].includes(a.kind))await page.getByRole('tab',{name:/Costituzione/}).click();
    if(a.kind==='presence')await page.locator((a.present?'#toggle-':'#absent-')+a.person).click();
    if(a.kind==='delegate'){await page.locator('#delegate-'+a.person).selectOption(a.delegate??'');await page.locator('#apply-'+a.person).click();}
    if(a.kind==='agenda_save'){
        await page.getByRole('tab',{name:/Ordine del giorno/}).click();
        if(!await page.evaluate(()=>window.gramlot.data.getItem('agendaUnlocked')))await page.locator('#agenda-lock').click();
        for(const item of a.items){
            if(!a.base.some(x=>x.id===item.id)){
                await page.locator('#agenda-new-title').fill(item.title);await page.locator('#agenda-new-title').press('Tab');await page.locator('#agenda-add').click();
            }else if(a.base.find(x=>x.id===item.id).title!==item.title){
                await page.locator('#agenda-title-'+item.id).fill(item.title);await page.locator('#agenda-title-'+item.id).press('Tab');
            }
        }
        for(const [index,item] of a.items.entries()){
            const order=await page.evaluate(()=>window.gramlot.data.getItem('agendaOrder'));
            if(order[index]!==item.id)await page.locator('#agenda-drag-'+item.id).dragTo(page.locator('#agenda-row-'+order[index]));
        }
        // Draft edits and drag gestures must not write SQLite until the explicit commit.
        expect((await snapshot(page)).view.agenda.map(({id,title})=>({id,title}))).toEqual(a.base);
        await expect(page.locator('#agenda-save').getByRole('button')).toBeEnabled();await page.locator('#agenda-save').click();
    }
    if(a.kind==='open'){await chooseItem(page,a.agenda,'vote');await page.locator('#ballot-open').click();}
    if(a.kind==='vote'||a.kind==='close'){
        await chooseItem(page,'a'+a.ballot.slice(1),'vote');
        await page.locator(a.kind==='vote'?`#vote-${a.person}-${a.choice}`:'#ballot-close').click();
    }
    if(a.kind==='intervention_add'){
        await chooseItem(page,a.agenda,'discussion');
        if(a.recorded_at)await page.clock.setFixedTime(new Date(a.recorded_at));
        await page.locator(a.administrator?'#intervention-admin':'#intervention-add').click();
        if(!a.administrator)await page.locator('#intervention-speaker').selectOption(a.person);
        await page.locator('#intervention-text').fill(a.text);await page.locator('#intervention-text').press('Tab');
        await page.locator('#intervention-register').getByRole('button').click();
    }
    if(a.kind==='note_save'&&a.interventions?.length){
        await chooseItem(page,a.agenda,'discussion');
        await page.locator('#interventions-copy').click();
        expect(await page.evaluate(()=>window.gramlot.data.getItem('noteDrafts.'+window.gramlot.logic.selected+'.minutes'))).toBe(a.value);
        expect((await snapshot(page)).view.agenda.find(x=>x.id===a.agenda).minutes).toBe(a.base);
        expect((await snapshot(page)).view.interventions.filter(x=>a.interventions.includes(x.id)).every(x=>!x.included)).toBe(true);
        await page.locator('#minutes-save').getByRole('button').click();
    }
    // Legacy general discussion notes remain supported by the transfer/domain API.
    if(a.kind==='note_save'&&a.field==='discussion')await page.evaluate(a=>window.gramlot.logic.act(a),a);
    if(a.kind==='note_save'&&a.field!=='discussion'&&!a.interventions?.length){
        await chooseItem(page,a.agenda,a.field);
        const field=page.locator(a.field==='discussion'?'#discussion':'#minutes-text');
        if(await page.evaluate(f=>window.gramlot.data.getItem('noteUI.'+f+'.readonly'),a.field))await page.locator('#'+a.field+'-lock').click();
        await fillNote(page,a.value,a.field);
        expect((await snapshot(page)).view.agenda.find(x=>x.id===a.agenda)[a.field]).toBe(a.base);
        await page.locator('#'+a.field+'-save').getByRole('button').click();
    }
    if(a.kind==='notes')await page.evaluate(a=>window.gramlot.logic.act(a),a);
    if(a.kind==='complete'){await chooseItem(page,a.agenda,'minutes');await page.locator('#item-complete').click();}
    await page.waitForFunction(()=>!window.gramlot.data.getItem('busy'));
    await expect(page.locator('#assembly-status')).toHaveText('Operazione salvata nel database locale.');
}

test('assembly: real Gramlot controls, Python parity, offline browser restart and export',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'asqueel-assembly-')),file=join(dir,'assemblea.html');
    await copyFile('output/assemblea-offline.html',file);
    const url=pathToFileURL(file).href,external=[],errors=[];
    const launch=async()=>{
        const context=await chromium.launchPersistentContext(join(dir,'profile'),{offline:true,viewport:{width:1280,height:960}});
        context.on('request',r=>{if(r.url()!==url&&!/^(blob:|data:)/.test(r.url()))external.push(r.url());});
        const watch=p=>{p.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR:',e.message);});p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE ERROR:',m.text());});};context.on('page',watch);context.pages().forEach(watch);return context;
    };
    let context=await launch();
    try{
        let page=context.pages()[0];await page.goto(url);await page.waitForFunction(()=>window.gramlot?.data.getItem('ready'),null,{timeout:25000});
        expect(await page.evaluate(()=>navigator.onLine)).toBe(false);
        await expect(page.getByRole('tab',{name:/Costituzione/})).toBeVisible();
        await page.screenshot({path:'output/assembly-workflow-initial.png',fullPage:true});
        compare(await snapshot(page),oracle.before);expect((await snapshot(page)).view).toEqual(oracle.initial);await comparePresenceLeds(page,oracle.initial);
        for(const [index,step] of oracle.steps.entries()){
            console.log(`Action ${index+1}/${oracle.steps.length}: ${JSON.stringify(step.action)}`);
            if(step.error){
                // Call the normal application boundary for invalid actions the UI prevents.
                await page.evaluate(a=>window.gramlot.logic.act(a),step.action);
                expect(await page.evaluate(()=>window.gramlot.data.getItem('lastError'))).toBe(step.error);
                const restored=await page.evaluate(()=>window.gramlot.logic.request('transfer-resume'));
                expect(restored.view).toEqual(step.view);
            }else{
                await execute(page,step.action);
                const actual=await snapshot(page);expect(actual.view).toEqual(step.view);await comparePresenceLeds(page,step.view);
                expect(actual.actionResult.trace).toEqual(step.trace);
                if(['open','vote','close'].includes(step.action.kind))await compareVoterGroups(page,step.view,step.action.ballot??step.action.id);
            }
        }
        compare(await snapshot(page),oracle.after);
        await page.getByRole('tab',{name:/Dati/}).click();
        await expect(page.locator('#assembly-history')).toContainText('215 millesimi');
        await expect(page.locator('#assembly-history')).toContainText('255 millesimi');
        const partial=await snapshot(page);
        await page.getByRole('tab',{name:/Verbale/}).click();
        await expect(page.locator('#minutes-document').frameLocator('iframe').locator('body')).toContainText('nuovi preventivi');
        await chooseItem(page,'a3','discussion');
        await page.locator('#assembly-participants').click();
        await expect(page.locator('#drawer-manage')).toBeVisible();
        await page.screenshot({path:'output/assembly-desktop.png',fullPage:true});
        await page.emulateMedia({colorScheme:'dark'});
        await page.screenshot({path:'output/assembly-workflow-dark.png',fullPage:true});
        await page.locator('#drawer-close').click();
        await page.emulateMedia({colorScheme:'light'});
        await page.setViewportSize({width:390,height:844});
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await page.screenshot({path:'output/assembly-phone.png',fullPage:true});
        await context.close();context=await launch();page=context.pages()[0];await page.goto(url);
        await expect(page.locator('#assembly-status')).toContainText('ripristinata');
        await chooseItem(page,'a3','discussion');
        await expect(page.locator('#intervention-list')).toContainText('Discussione ancora aperta, riprendere dopo il riavvio.');
        const restored=await snapshot(page);compare(restored,partial);expect(restored.view).toEqual(partial.view);
        // Earlier groups remain frozen after later attendance changes and proxy revocation.
        await chooseItem(page,'a1','vote');await compareVoterGroups(page,oracle.steps.at(-1).view,'b1');
        await expect(page.locator('#voter-group-p2 #vote-row-p2')).toHaveCount(1);
        await chooseItem(page,'a2','vote');await compareVoterGroups(page,oracle.steps.at(-1).view,'b2');
        await expect(page.locator('#voter-group-p3 #choice-p2')).toHaveText('Contrario');
        await expect(page.locator('#voter-group-p3 #choice-p3')).toHaveText('Favorevole');
        await page.getByRole('tab',{name:/Documenti/}).click();await page.locator('#document-d2').click();
        await expect(page.frameLocator('#document-preview').locator('body')).toContainText('VerdeChiaro');
        await expect(page.locator('#document-preview')).toHaveAttribute('sandbox','');
        const docDownload=page.waitForEvent('download');await page.locator('#document-download').click();
        expect(await readFile(await (await docDownload).path(),'utf8')).toBe(oracle.initial.documents.find(d=>d.id==='d2').content);
        await page.screenshot({path:'output/assembly-document.png',fullPage:true});
        const pending=page.waitForEvent('download');await page.locator('#assembly-export').click();
        await writeFile('output/assembly-browser-return.json',await readFile(await (await pending).path()));
        expect(errors).toEqual([]);
        expect(external).toEqual([]);
    }finally{await context.close();await rm(dir,{recursive:true,force:true});}
});

test('compact navigation, draft handoff, drawer and small-screen themes',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'assembly-ui-'));
    const context=await chromium.launchPersistentContext(dir,{offline:true,viewport:{width:820,height:1000}});
    try{
        const page=context.pages()[0];await page.goto(pathToFileURL(join(process.cwd(),'output/assemblea-offline.html')).href);
        await page.waitForFunction(()=>window.gramlot?.data.getItem('ready'),null,{timeout:25000});
        await chooseItem(page,'a1','minutes');
        await page.locator('#minutes-lock').click();await fillMinutes(page,"Intervento da conservare cambiando punto.");
        await chooseItem(page,'a2','topic');
        expect((await snapshot(page)).view.agenda[0].minutes).toBe('');
        await chooseItem(page,'a1','minutes');await expect(noteInput(page,'minutes')).toHaveValue('Intervento da conservare cambiando punto.');
        await page.locator('#minutes-save').getByRole('button').click();await page.waitForFunction(()=>!window.gramlot.data.getItem('busy'));
        await expect(page.locator('#minutes-save').getByRole('button')).toBeDisabled();
        expect((await snapshot(page)).view.agenda[0].minutes).toBe("Intervento da conservare cambiando punto.");
        await page.getByRole('tab',{name:/Costituzione/}).click();
        await expect(page.locator('[id^="person-row-"]')).toHaveCount(24);
        await page.locator('#roster-search').fill('D06');await page.locator('#roster-search').press('Tab');
        await expect(page.locator('[id^="person-row-"]:visible')).toHaveCount(1);
        await expect(page.locator('#person-row-p24')).toBeVisible();
        await page.locator('#roster-search').fill('');await page.locator('#roster-search').press('Tab');
        await page.locator('#roster-filter').selectOption('delegated');await expect(page.locator('[id^="person-row-"]:visible')).toHaveCount(3);
        await page.locator('#roster-filter').selectOption('all');
        for(const colorScheme of ['light','dark']){
            await page.emulateMedia({colorScheme});await page.evaluate(mode=>document.documentElement.dataset.theme=mode,colorScheme);
            for(const width of [820,390]){
                await page.setViewportSize({width,height:900});
                await page.getByRole('tab',{name:/Costituzione/}).click();
                expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
                await page.locator('#assembly-participants').click();await expect(page.locator('#drawer-manage')).toBeVisible();
                await page.screenshot({path:`output/assembly-drawer-${colorScheme}-${width}.png`,fullPage:true});
                await page.locator('#drawer-manage').click();await expect(page.locator('#drawer-manage')).not.toBeVisible();
            }
        }
        await page.setViewportSize({width:1280,height:960});
        await page.getByRole('tab',{name:/Costituzione/}).focus();await page.keyboard.press('ArrowRight');
        await expect(page.getByRole('tab',{name:/Ordine del giorno/})).toHaveAttribute('aria-selected','true');
    }finally{await context.close();await rm(dir,{recursive:true,force:true});}
});

test('agenda lock, blur-to-Bag, draft validation, keyboard reorder and explicit commit',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'assembly-agenda-'));
    const context=await chromium.launchPersistentContext(dir,{offline:true,viewport:{width:1280,height:900}});
    try{
        const page=context.pages()[0],errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(pathToFileURL(join(process.cwd(),'output/assemblea-offline.html')).href);
        await page.waitForFunction(()=>window.gramlot?.data.getItem('ready'),null,{timeout:25000});
        await page.getByRole('tab',{name:/Ordine del giorno/}).click();
        const title=page.locator('#agenda-title-a1'),save=page.locator('#agenda-save').getByRole('button');
        await expect(title).toHaveAttribute('readonly','');await expect(save).toBeDisabled();
        await expect(page.locator('#agenda-drag-a1')).toHaveAttribute('draggable','false');
        await page.locator('#agenda-lock').click();await expect(title).not.toHaveAttribute('readonly','');
        await title.fill('Bilancio aggiornato');
        expect(await page.evaluate(()=>window.gramlot.data.getItem('agendaDraft.a1'))).toBe('Bilancio preventivo');
        await title.press('Tab');
        expect(await page.evaluate(()=>window.gramlot.data.getItem('agendaDraft.a1'))).toBe('Bilancio aggiornato');
        expect((await snapshot(page)).view.agenda[0].title).toBe('Bilancio preventivo');await expect(save).toBeEnabled();
        await title.fill('Bilancio preventivo');await title.press('Tab');await expect(save).toBeDisabled();
        await title.fill('Bilancio aggiornato');await title.press('Tab');
        await page.locator('#agenda-lock').click();await expect(title).toHaveAttribute('readonly','');await expect(save).toBeEnabled();
        await page.locator('#agenda-lock').click();
        await page.locator('#agenda-drag-a5').dragTo(page.locator('#agenda-row-a1'));
        expect(await page.evaluate(()=>window.gramlot.data.getItem('agendaOrder'))).toEqual(['a5','a1','a2','a3','a4']);
        await page.locator('#agenda-drag-a2').getByRole('button').press('Enter');await page.locator('#agenda-drag-a3').getByRole('button').press('Enter');
        expect(await page.evaluate(()=>window.gramlot.data.getItem('agendaOrder'))).toEqual(['a5','a1','a3','a2','a4']);
        await title.fill('   ');await title.press('Tab');await save.click();
        await expect(page.locator('#assembly-status')).toContainText('Inserisci un titolo');
        expect((await snapshot(page)).view.agenda).toEqual(oracle.initial.agenda);await expect(save).toBeEnabled();
        await title.fill('Bilancio aggiornato');await title.press('Tab');
        for(const colorScheme of ['light','dark']){
            await page.emulateMedia({colorScheme});await page.evaluate(mode=>document.documentElement.dataset.theme=mode,colorScheme);await page.screenshot({path:`output/assembly-agenda-draft-${colorScheme}.png`,fullPage:true});
        }
        await page.setViewportSize({width:390,height:844});
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await page.screenshot({path:'output/assembly-agenda-phone.png',fullPage:true});
        await save.click();await page.waitForFunction(()=>!window.gramlot.data.getItem('busy'));
        await expect(save).toBeDisabled();
        const committed=(await snapshot(page)).view.agenda;
        await page.reload();await page.waitForFunction(()=>window.gramlot?.data.getItem('ready'));
        expect((await snapshot(page)).view.agenda).toEqual(committed);
        await page.getByRole('tab',{name:/Ordine del giorno/}).click();
        await page.locator('#agenda-lock').click();await title.fill('Bozza locale');await title.press('Tab');
        // Another writer wins first; the stale draft cannot silently overwrite it.
        await page.evaluate(()=>window.gramlot.logic.act({kind:'agenda_edit',agenda:'a1',title:'Aggiornamento da altra finestra'}));
        await expect(title).toHaveValue('Bozza locale');await save.click();
        await expect(page.locator('#assembly-status')).toContainText('un’altra finestra');await expect(save).toBeEnabled();
        page.once('dialog',dialog=>dialog.accept());await page.locator('#agenda-discard').click();
        await expect(title).toHaveValue('Aggiornamento da altra finestra');await expect(save).toBeDisabled();
        expect(errors).toEqual([]);
    }finally{await context.close();await rm(dir,{recursive:true,force:true});}
});

test('minutes locks, independent drafts, guided proxies and vote progress offline',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'assembly-notes-')),file=join(dir,'assemblea.html');
    await copyFile('output/assemblea-offline.html',file);
    const url=pathToFileURL(file).href,errors=[];
    const launch=()=>chromium.launchPersistentContext(join(dir,'profile'),{offline:true,viewport:{width:1280,height:960}});
    let context=await launch();
    try{
        let page=context.pages()[0];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
        await page.waitForFunction(()=>window.gramlot?.data.getItem('ready'));
        await expect(page.locator('#delegate-help')).toContainText('Paolo assente → Anna presente');
        await expect(page.locator('#apply-p4').getByRole('button')).toBeDisabled();
        for(const person of ['p1','p2','p3'])await execute(page,{kind:'presence',person,present:true});
        await expect(page.locator('#delegate-p1')).toBeDisabled();
        await execute(page,{kind:'delegate',person:'p4',delegate:'p1'});
        await expect(page.locator('#presence-p4')).toContainText('Delega a Anna Rossi');
        await expect(page.locator('#attendance-weight')).toHaveText('215');
        await page.screenshot({path:'output/assembly-delegates-guide.png',fullPage:true});
        await chooseItem(page,'a1','minutes');await page.locator('#minutes-lock').click();
        await fillMinutes(page,'Blocco di verbale ancora in bozza.');
        await page.locator('#item-complete').click();await expect(page.locator('#assembly-status')).toContainText('Salva o annulla');
        expect((await snapshot(page)).view.agenda[0].completed).toBeFalsy();
        await page.evaluate(()=>window.gramlot.logic.act({kind:'note_save',agenda:'a1',field:'minutes',base:'',value:'Verbale da altra finestra.'}));
        await expect(noteInput(page)).toHaveValue('Blocco di verbale ancora in bozza.');
        await page.locator('#minutes-save').getByRole('button').click();await expect(page.locator('#assembly-status')).toContainText('un’altra finestra');
        page.once('dialog',d=>d.accept());await page.locator('#minutes-discard').getByRole('button').click();
        await expect(noteInput(page)).toHaveValue('Verbale da altra finestra.');
        await expect(page.locator('#minutes-save').getByRole('button')).toBeDisabled();
        await fillMinutes(page,"Verbale definitivo di prova.");
        await page.locator('#minutes-save').getByRole('button').click();await page.waitForFunction(()=>!window.gramlot.data.getItem('busy'));await expect(page.locator('#minutes-save').getByRole('button')).toBeDisabled();
        await chooseItem(page,'a1','vote');await expect(page.locator('#vote-help')).toContainText('Ogni scelta è salvata subito offline');
        await page.locator('#ballot-open').click();await expect(page.locator('#vote-progress')).toContainText('0 di 4');
        await expect(page.locator('#vote-row-p4')).toContainText('Vota Anna Rossi per delega');
        await expect(page.locator('#ballot-close').getByRole('button')).toBeDisabled();
        await compareVoterGroups(page,(await snapshot(page)).view,'b1');
        await expect(page.locator('#voter-group-p1 #vote-row-p4')).toHaveCount(1);
        await expect(page.locator('#voter-summary-p1')).toHaveText('Per sé e 1 delega · 2 soggetti · 110 ‰');
        await page.screenshot({path:'output/assembly-voting-guide.png',fullPage:true});
        await page.emulateMedia({colorScheme:'light'});await page.screenshot({path:'output/assembly-voter-groups-light.png',fullPage:true});
        await page.setViewportSize({width:390,height:844});
        await page.locator('#voter-group-p1').scrollIntoViewIfNeeded();
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await page.screenshot({path:'output/assembly-voter-groups-phone.png',fullPage:true});
        await page.setViewportSize({width:1280,height:960});
        for(const [person,choice] of [['p1','yes'],['p2','no'],['p3','abstain'],['p4','yes']])await execute(page,{kind:'vote',ballot:'b1',person,choice});
        await expect(page.locator('#vote-progress')).toContainText('4 di 4');
        // The same cast votes and weighted result as the independent Python reference.
        const voted=oracle.steps.find(s=>s.action.kind==='close'&&!s.error&&s.action.ballot==='b1').view;
        expect((await snapshot(page)).view.totals).toEqual(voted.totals);
        await expect(page.locator('#ballot-close').getByRole('button')).toBeEnabled();
        await page.locator('#ballot-close').click();await page.waitForFunction(()=>!window.gramlot.data.getItem('busy'));await expect(noteInput(page)).toHaveValue('Verbale definitivo di prova.');
        const before=await snapshot(page);await context.close();context=await launch();page=context.pages()[0];await page.goto(url);
        await page.waitForFunction(()=>window.gramlot?.data.getItem('ready'));
        compare(await snapshot(page),before);expect((await snapshot(page)).view).toEqual(before.view);
        await chooseItem(page,'a1','minutes');await expect(noteInput(page)).toHaveValue('Verbale definitivo di prova.');
        expect(await noteInput(page).evaluate(body=>!body.readOnly)).toBe(false);
        await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/assembly-minutes-phone.png',fullPage:true});
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await page.evaluate(()=>window.gramlot.logic.act({kind:'complete',agenda:'a1'}));
        await chooseItem(page,'a1','discussion');await expect(page.locator('#intervention-add').getByRole('button')).toBeDisabled();
        await expect(page.locator('#intervention-admin').getByRole('button')).toBeDisabled();
        expect(errors).toEqual([]);
    }finally{await context.close();await rm(dir,{recursive:true,force:true});}
});

test('consistent fixed commands, no dictation and direct import into a minutes draft',async()=>{
    const browser=await chromium.launch(),context=await browser.newContext({offline:true,viewport:{width:1280,height:900}});
    try{
        const page=await context.newPage();await page.goto(pathToFileURL(join(process.cwd(),'output/assemblea-offline.html')).href);
        await page.waitForFunction(()=>window.gramlot?.data.getItem('ready'));await chooseItem(page,'a1','discussion');
        await expect(page.locator('[id*="dictation"]')).toHaveCount(0);
        await expect(page.getByRole('button',{name:/Detta|Ferma/})).toHaveCount(0);
        await expect(page.locator('#interventions-minutes-lock')).toHaveCount(0);
        const register=page.locator('#intervention-register').getByRole('button'),cancel=page.locator('#intervention-cancel').getByRole('button');
        await expect(register).toBeVisible();await expect(register).toBeDisabled();await expect(cancel).toBeDisabled();
        const before=await register.boundingBox();
        await page.screenshot({path:'output/assembly-controls-empty.png'});
        await page.locator('#intervention-add').click();
        expect(await register.boundingBox()).toEqual(before);
        await expect(page.locator('#intervention-add').getByRole('button')).toBeDisabled();
        await page.locator('#intervention-speaker').selectOption('p1');
        const text=Array.from({length:24},(_,i)=>`Osservazione ${i+1}: confrontare i preventivi e le scadenze.`).join('\n');
        await page.locator('#intervention-text').fill(text);await page.locator('#intervention-text').press('Tab');
        await expect(register).toBeEnabled();expect((await snapshot(page)).view.interventions).toEqual([]);
        await page.screenshot({path:'output/assembly-controls-compose.png'});
        await register.click();await page.waitForFunction(()=>!window.gramlot.data.getItem('busy'));
        expect(await register.boundingBox()).toEqual(before);await expect(register).toBeDisabled();
        for(const width of [1280,390]){
            await page.setViewportSize({width,height:844});
            const toolbar=page.locator('#discussion-toolbar'),footer=page.locator('#discussion-footer'),scroll=page.locator('#discussion-scroll');
            await scroll.evaluate(el=>el.scrollTop=0);const top=await toolbar.boundingBox(),bottom=await footer.boundingBox();
            await scroll.evaluate(el=>el.scrollTop=el.scrollHeight);
            expect(await scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
            expect(await toolbar.boundingBox()).toEqual(top);expect(await footer.boundingBox()).toEqual(bottom);
            await expect(register).toBeInViewport();await expect(page.locator('#discussion-next')).toBeInViewport();
            expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
            await page.screenshot({path:`output/assembly-controls-discussion-${width}.png`});
        }
        // Import explicitly opens the minutes draft; it must not persist or mark entries yet.
        expect(await page.evaluate(()=>window.gramlot.data.getItem('noteUI.minutes.readonly'))).toBe(true);
        await page.locator('#interventions-copy').click();await expect(noteInput(page)).toBeEditable();
        await expect(page.locator('#minutes-lock')).toHaveText('🔓 Blocca');
        await expect(page.locator('#minutes-save').getByRole('button')).toBeEnabled();
        expect((await snapshot(page)).view.agenda[0].minutes).toBe('');expect((await snapshot(page)).view.interventions[0].included).toBeFalsy();
        await page.screenshot({path:'output/assembly-controls-minutes-phone.png'});
        await page.locator('#minutes-lock').click();await expect(noteInput(page)).not.toBeEditable();
        await page.locator('#minutes-save').click();await page.waitForFunction(()=>!window.gramlot.data.getItem('busy'));
        expect((await snapshot(page)).view.agenda[0].minutes).toContain(text);expect((await snapshot(page)).view.interventions[0].included).toBeTruthy();
        await page.reload();await page.waitForFunction(()=>window.gramlot?.data.getItem('ready'));await chooseItem(page,'a1','minutes');
        await expect(noteInput(page)).not.toBeEditable();await expect(noteInput(page)).toHaveValue('Intervento 1 — Anna Rossi\n'+text);
    }finally{await browser.close();}
});

test('attributed interventions: selective import, discard, duplicate prevention and offline persistence',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'assembly-interventions-')),file=join(dir,'assemblea.html');
    await copyFile('output/assemblea-offline.html',file);
    const url=pathToFileURL(file).href,errors=[];
    const launch=()=>chromium.launchPersistentContext(join(dir,'profile'),{offline:true,viewport:{width:1280,height:960}});
    let context=await launch();
    try{
        let page=context.pages()[0];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
        await page.waitForFunction(()=>window.gramlot?.data.getItem('ready'));
        await execute(page,{kind:'note_save',agenda:'a1',field:'minutes',base:'',value:"Introduzione già salvata."});
        await execute(page,{kind:'intervention_add',id:'i1',agenda:'a1',person:'p1',base:'',text:"Proposta di Anna."});
        await expect(page.locator('#intervention-composer')).toBeHidden();
        await execute(page,{kind:'intervention_add',id:'i2',agenda:'a1',person:'p2',base:"Proposta di Anna.",text:"Osservazione di Luca."});
        await expect(page.locator('#intervention-i1')).toContainText('Anna Rossi');
        await expect(page.locator('#intervention-i2')).toContainText('Luca Bianchi');
        await page.locator('#intervention-copy-i1').click();
        await expect(noteInput(page)).toHaveValue(new RegExp("Introduzione\\ già\\ salvata\\."));
        await expect(noteInput(page)).toHaveValue(new RegExp("Proposta\\ di\\ Anna\\."));
        await expect(noteInput(page)).not.toHaveValue(new RegExp("Osservazione\\ di\\ Luca\\."));
        expect((await snapshot(page)).view.interventions.every(x=>!x.included)).toBe(true);
        page.once('dialog',d=>d.accept());await page.locator('#minutes-discard').getByRole('button').click();
        await expect(noteInput(page)).toHaveValue('Introduzione già salvata.');
        await page.locator('#step-discussion').click();await expect(page.locator('#intervention-copy-i1').getByRole('button')).toBeEnabled();
        await page.locator('#intervention-copy-i1').click();
        await page.locator('#minutes-save').getByRole('button').click();await page.waitForFunction(()=>!window.gramlot.data.getItem('busy'));
        await page.locator('#step-discussion').click();
        await expect(page.locator('#intervention-status-i1')).toHaveText('Riportato nel verbale');
        await expect(page.locator('#intervention-copy-i1').getByRole('button')).toBeDisabled();
        await page.locator('#interventions-copy').click();
        expect((await noteInput(page).inputValue()).split('Intervento 1 — Anna Rossi')).toHaveLength(2);
        await expect(noteInput(page)).toHaveValue(new RegExp("Intervento\\ 2\\ —\\ Luca\\ Bianchi"));
        await page.locator('#minutes-save').getByRole('button').click();await page.waitForFunction(()=>!window.gramlot.data.getItem('busy'));
        await page.locator('#step-discussion').click();await expect(page.locator('#interventions-copy').getByRole('button')).toBeDisabled();
        await page.screenshot({path:'output/assembly-interventions.png',fullPage:true});
        await page.setViewportSize({width:390,height:844});
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await page.screenshot({path:'output/assembly-interventions-phone.png',fullPage:true});
        const before=await snapshot(page);await context.close();context=await launch();page=context.pages()[0];await page.goto(url);
        await page.waitForFunction(()=>window.gramlot?.data.getItem('ready'));compare(await snapshot(page),before);
        await chooseItem(page,'a1','discussion');await expect(page.locator('#intervention-status-i2')).toHaveText('Riportato nel verbale');
        await page.locator('#step-minutes').click();await expect(noteInput(page)).toHaveValue(new RegExp("Introduzione\\ già\\ salvata\\."));
        await expect(noteInput(page)).toHaveValue(new RegExp("Osservazione\\ di\\ Luca\\."));expect(errors).toEqual([]);
    }finally{await context.close();await rm(dir,{recursive:true,force:true});}
});


test('plain text notes keep tools fixed while scrolling and preserve untouched legacy HTML',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'assembly-textarea-')),file=join(dir,'assemblea.html');
    await copyFile('output/assemblea-offline.html',file);
    const context=await chromium.launchPersistentContext(join(dir,'profile'),{offline:true,viewport:{width:1280,height:960}});
    try{
        const page=context.pages()[0];await page.goto(pathToFileURL(file).href);
        await page.waitForFunction(()=>window.gramlot?.data.getItem('ready'));
        const legacy='<h3>Premessa</h3><p><strong>Prima riga</strong><br>Seconda riga</p><p>Conclusione &amp; proposta.</p>';
        await page.evaluate(value=>window.gramlot.logic.act({kind:'note_save',agenda:'a1',field:'minutes',base:'',value}),legacy);
        await chooseItem(page,'a1','minutes');
        await expect(noteInput(page)).toHaveValue('Premessa\nPrima riga\nSeconda riga\nConclusione & proposta.');
        await page.locator('#minutes-lock').click();await noteInput(page).focus();await page.locator('#minutes-lock').getByRole('button').focus();
        await expect(page.locator('#minutes-save').getByRole('button')).toBeDisabled();
        expect((await snapshot(page)).view.agenda[0].minutes).toBe(legacy);
        for(const field of ['minutes']){
            await chooseItem(page,'a1',field);
            if(await noteInput(page,field).evaluate(el=>el.readOnly))await page.locator('#'+field+'-lock').click();
            const value='Testo semplice\nSeconda riga & proposta <da discutere>.';
            await noteInput(page,field).fill(value);
            await page.locator('#'+field+'-lock').getByRole('button').focus();
            expect(await page.evaluate(f=>window.gramlot.data.getItem('noteDrafts.a1.'+f),field)).toBe(value);
            await page.locator('#'+field+'-save').getByRole('button').click();await page.waitForFunction(()=>!window.gramlot.data.getItem('busy'));
            expect((await snapshot(page)).view.agenda[0][field]).toBe(value);
            await expect(page.locator('gramlot-html-editor')).toHaveCount(0);
            for(const width of [1280,390]){
                await page.setViewportSize({width,height:844});
                const scroll=page.locator('#'+field+'-scroll'),toolbar=page.locator('#'+field+'-toolbar');
                await scroll.evaluate(el=>el.scrollTop=0);const before=await toolbar.boundingBox();
                await scroll.evaluate(el=>el.scrollTop=el.scrollHeight);
                expect(await scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
                const after=await toolbar.boundingBox();expect(after.y).toBeCloseTo(before.y,0);
                await expect(page.locator('#'+field+'-lock')).toBeInViewport();
                await expect(page.locator('#'+field+'-save')).toBeInViewport();
                expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
                await page.screenshot({path:`output/assembly-textarea-${field}-${width}.png`});
            }
        }
        await page.reload();await page.waitForFunction(()=>window.gramlot?.data.getItem('ready'));
        await chooseItem(page,'a1','minutes');await expect(noteInput(page)).toHaveValue('Testo semplice\nSeconda riga & proposta <da discutere>.');
    }finally{await context.close();await rm(dir,{recursive:true,force:true});}
});

test('discussion timeline: participant picker, separate administrator, timestamps, drafts and Mimi dark',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'assembly-timeline-')),file=join(dir,'assemblea.html');
    await copyFile('output/assemblea-offline.html',file);
    const context=await chromium.launchPersistentContext(join(dir,'profile'),{offline:true,viewport:{width:1280,height:900},colorScheme:'light'});
    try{
        const page=context.pages()[0];await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>window.gramlot?.data.getItem('ready'));
        await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
        expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--gramlot-background').trim())).toBe('#242527');
        await chooseItem(page,'a1','discussion');
        await expect(page.locator('#discussion-toolbar')).toBeVisible();await expect(page.locator('#discussion')).toHaveCount(0);
        await expect(page.locator('#intervention-composer')).toBeHidden();
        await page.clock.setFixedTime(new Date('2026-10-22T18:00:12.000Z'));
        await page.locator('#intervention-add').click();await expect(page.locator('#intervention-composer')).toContainText('Chi interviene?');
        await expect(page.locator('#intervention-register').getByRole('button')).toBeDisabled();
        await page.locator('#intervention-speaker').selectOption('p1');await page.locator('#intervention-text').fill('Anna propone un secondo preventivo.');
        await chooseItem(page,'a2','discussion');await expect(page.locator('#intervention-composer')).toBeHidden();
        await chooseItem(page,'a1','discussion');await expect(page.locator('#intervention-text')).toHaveValue('Anna propone un secondo preventivo.');
        expect((await snapshot(page)).view.interventions).toEqual([]);
        await page.locator('#assembly-export').click();await expect(page.locator('#assembly-status')).toContainText('Registra o annulla');
        await page.clock.setFixedTime(new Date('2026-10-22T18:02:00.000Z'));await page.locator('#intervention-register').click();
        await page.waitForFunction(()=>!window.gramlot.data.getItem('busy'));await expect(page.locator('#intervention-composer')).toBeHidden();
        let rows=(await snapshot(page)).view.interventions;expect(rows[0].recorded_at).toBe('2026-10-22T18:00:12.000Z');expect(rows[0].speaker).toBe('Anna Rossi');
        await page.locator('#intervention-admin').click();await expect(page.locator('#intervention-speaker')).toBeHidden();
        await expect(page.locator('#intervention-composer')).toContainText('Intervento dell’amministratore');
        await page.locator('#intervention-text').fill('L’amministratore precisa le scadenze.');await page.locator('#intervention-text').press('Tab');await page.locator('#intervention-register').click();
        await page.waitForFunction(()=>!window.gramlot.data.getItem('busy'));
        rows=(await snapshot(page)).view.interventions;expect(rows).toHaveLength(2);expect(rows[1].person_id).toBeNull();expect(rows[1].speaker).toBe('Amministratore');expect(rows[1].recorded_at).toBe('2026-10-22T18:02:00.000Z');
        expect((await snapshot(page)).view.people).toHaveLength(24);expect((await snapshot(page)).view.attendance.total).toBe(1000);
        await expect(page.locator('#intervention-time-i1')).toContainText('22/10/2026');await expect(page.locator('#intervention-time-i2')).not.toContainText('non disponibile');
        await page.screenshot({path:'output/assembly-timeline-mimi.png'});
        await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'output/assembly-timeline-mimi-phone.png'});
        await page.locator('#intervention-add').click();await page.locator('#intervention-speaker').selectOption('p2');await page.locator('#intervention-text').fill('Bozza da annullare.');
        page.once('dialog',d=>d.accept());await page.locator('#intervention-cancel').click();await expect(page.locator('#intervention-composer')).toBeHidden();
        await page.reload();await page.waitForFunction(()=>window.gramlot?.data.getItem('ready'));expect((await snapshot(page)).view.interventions).toEqual(rows);
        await chooseItem(page,'a1','discussion');await expect(page.locator('#intervention-i2')).toContainText('L’amministratore precisa le scadenze.');
    }finally{await context.close();await rm(dir,{recursive:true,force:true});}
});
