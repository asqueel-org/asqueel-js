import {buildDirectory} from '@gramlot/gramlot-serverless/directory';
import {build as bundle} from 'esbuild';
import editors from '@gramlot/gramlot/components/editors';
import layout from '@gramlot/gramlot/components/layout';
import {HtmlBuilder} from '@genrojs/builders';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile,writeFile,rename,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';

// Use the official directory exporter with component collections, then inline
// its generated scripts and our styles.
export async function buildAssemblyHTML(){
    const require=createRequire(import.meta.url),entry=resolve('browser/dist/assembly-entry.js'),dir=resolve('output/assembly-directory');
    await writeFile(entry,`import {Page as AssemblyPage} from '../assembly.js';\nexport {Logic} from '../assembly.js';\nexport class Page extends AssemblyPage {static css=[];static css_theme=false;}\n`);
    const editorsEntry=resolve('browser/dist/assembly-editors.js');
    await bundle({entryPoints:[require.resolve('@gramlot/gramlot/components/editors')],outfile:editorsEntry,bundle:true,format:'esm',platform:'browser',loader:{'.css':'text'},legalComments:'inline'});
    await buildDirectory({pages:{index:entry},output:dir,
        collections:[{grammar:layout.toDocument(),module:'/collections/layout.js'},{grammar:editors.toDocument(),module:'/collections/editors.js'}],
        assets:[{source:require.resolve('@gramlot/gramlot/components/layout'),target:'collections/layout.js'},{source:editorsEntry,target:'collections/editors.js'}]});
    const scripts=await Promise.all(['assets/standalone.js','assets/collections.js','assets/workers/index.js'].map(async path=>(await readFile(join(dir,path),'utf8')).replace(/<\/script/gi,'<\\/script')));
    const hashes=scripts.map(script=>`'sha256-${createHash('sha256').update(script).digest('base64')}'`).join(' ');
    const doc=new HtmlBuilder(),html=doc.root.html({lang:'it','data-theme':'dark'}),head=html.head();
    head.meta({charset:'utf-8'});head.meta({name:'viewport',content:'width=device-width,initial-scale=1'});
    head.meta({'http-equiv':'Content-Security-Policy',content:`default-src 'none'; script-src ${hashes} 'unsafe-eval' blob:; worker-src blob:; style-src 'unsafe-inline'; img-src data: blob:; connect-src blob:; frame-src blob:; base-uri 'none'; form-action 'none'`});
    head.title('Assemblea · Gramlot e Asqueel-JS');
    for(const path of [require.resolve('@gramlot/gramlot/themes/gramlot-base/theme.css'),require.resolve('@gramlot/gramlot/themes/gramlot-compact/theme.css'),require.resolve('@gramlot/gramlot/themes/mimi/theme.css'),resolve('browser/assembly.css')])head.style((await readFile(path,'utf8')).replace(/<\/style/gi,'<\\/style'));
    head.script((await readFile(join(dir,'assets/runtime-notices.json'),'utf8')).replaceAll('<','\\u003c'),{type:'application/json',id:'gramlot-runtime-notices'});
    const body=html.body();body.div({id:'gramlot-root'});for(const script of scripts)body.script(script);
    const content='<!doctype html>'+doc.render(),output=resolve('output/assemblea-offline.html'),temp=output+'.tmp';
    for(const script of scripts)if(!content.includes(`<script>${script}</script>`))throw Error('Script bytes changed; CSP hash would be invalid');
    try{await writeFile(temp,content);await rename(temp,output);}finally{await rm(temp,{force:true});}
    return {output,bytes:Buffer.byteLength(content)};
}
