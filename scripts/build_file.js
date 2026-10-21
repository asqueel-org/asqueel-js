import {build as bundle} from 'esbuild';
import {build} from '@gramlot/gramlot-serverless';
import {readFile, writeFile, mkdir} from 'node:fs/promises';

const wasm = (await readFile('node_modules/wa-sqlite/dist/wa-sqlite-async.wasm')).toString('base64');
const worker = await bundle({entryPoints:['browser/file-sqlite-worker.js'],bundle:true,format:'iife',platform:'browser',write:false,
    // No import.meta-based asset lookup is used when wasmBinary is supplied.
    define:{'import.meta.url':'""'},
    plugins:[{name:'embedded-wasm',setup(build) {
        build.onResolve({filter:/^embedded-sqlite-wasm$/},()=>({path:'sqlite',namespace:'embedded-wasm'}));
        build.onLoad({filter:/.*/,namespace:'embedded-wasm'},()=>({contents:
            `export default Uint8Array.from(atob(${JSON.stringify(wasm)}),c=>c.charCodeAt(0));`,loader:'js'}));
    }}]});
await mkdir('browser/dist',{recursive:true});
await writeFile('browser/dist/file-transfer-assets.js',`export const workerSource=${JSON.stringify(worker.outputFiles[0].text)};\n`);
const result=await build({page:'browser/file-transfer.js',output:'output/asqueel-offline.html'});
console.log(`Gramlot HTML: ${result.output} (${result.bytes} bytes)`);
