import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Dictation} from '../browser/assembly-dictation.js';
import {noteHTML,hasMinutesText} from '../browser/assembly-text.js';
function harness({local=true,online=false,available='available',supported=true}={}){
    const calls=[],texts=[],statuses=[],active=[];
    class Recognition {
        static async available(options){calls.push(['available',options]);return available;}
        constructor(){if(local)this.processLocally=false;Recognition.last=this;}
        start(){calls.push(['start',this.processLocally,this.lang]);}
        abort(){calls.push(['abort']);}
    }
    const d=new Dictation({window:{SpeechRecognition:supported?Recognition:undefined,navigator:{onLine:online}},onText:t=>texts.push(t),onStatus:t=>statuses.push(t),onActive:v=>active.push(v)});
    return {d,Recognition,calls,texts,statuses,active};
}
test('local recognition is explicit, Italian and delivers only final text; stop ignores late events',async()=>{
    const h=harness();assert.deepEqual(h.calls,[]);await h.d.start();
    assert.deepEqual(h.calls.at(-1),['start',true,'it-IT']);
    const r=h.Recognition.last,partial=Object.assign([{transcript:'bozza'}],{isFinal:false}),final=Object.assign([{transcript:'  Testo definitivo  '}],{isFinal:true});
    r.onresult({resultIndex:0,results:[partial]});assert.deepEqual(h.texts,[]);
    r.onresult({resultIndex:0,results:[final]});assert.deepEqual(h.texts,['Testo definitivo']);
    h.d.stop();r.onresult({resultIndex:0,results:[final]});assert.equal(h.texts.length,1);assert.equal(h.active.at(-1),false);
});
test('missing API, local language or local support never starts remote recognition',async()=>{
    for(const options of [{supported:false},{local:false},{available:'downloadable'},{available:'unavailable'}]){
        const h=harness(options);await h.d.start();assert.equal(h.calls.some(c=>c[0]==='start'),false);assert.ok(h.statuses.at(-1));assert.equal(h.active.at(-1),false);
    }
});
test('online speech requires explicit mode and a connection; permission errors stop capture',async()=>{
    const offline=harness();await offline.d.start('online');assert.equal(offline.calls.some(c=>c[0]==='start'),false);
    const h=harness({online:true});await h.d.start('online');assert.deepEqual(h.calls.at(-1),['start',false,'it-IT']);
    h.Recognition.last.onerror({error:'not-allowed'});assert.match(h.statuses.at(-1),/negato/);assert.equal(h.active.at(-1),false);
});
test('cancelling while language support is checked cannot start the microphone later',async()=>{
    const h=harness();let resolve;h.Recognition.available=()=>new Promise(r=>resolve=r);
    const pending=h.d.start();h.d.stop();resolve('available');await pending;assert.equal(h.calls.some(c=>c[0]==='start'),false);
});
test('legacy text is escaped for preview; existing HTML formatting survives',()=>{
    assert.equal(noteHTML('a < b\nseconda riga'),'<p>a &lt; b<br>seconda riga</p>');
    assert.equal(noteHTML('<p><strong>Delibera</strong></p>'),'<p><strong>Delibera</strong></p>');
});

test('empty formatted minutes do not count as a written minute',()=>{
    for(const value of ['', '<p><br></p>', '<p>&nbsp; \u200b</p>', '<style>text</style>'])assert.equal(hasMinutesText(value),false);
    assert.equal(hasMinutesText('<p><strong>Approvato</strong></p>'),true);
});

test('file HTML never probes the unstable local speech service',async()=>{
    const h=harness();h.d.window.location={protocol:'file:'};await h.d.start();
    assert.equal(h.calls.length,0);assert.match(h.statuses.at(-1),/non abilitata da file HTML/);
});
