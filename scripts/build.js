import {build} from 'esbuild';
import {copyFile, cp, mkdir, readFile, writeFile, readdir} from 'node:fs/promises';
await mkdir('browser/dist', {recursive: true});
const app = await build({metafile:true, entryPoints: ['browser/app.js', 'browser/logic.js', 'browser/index-logic.js', 'browser/editors.js',
    'browser/layout.js', 'browser/tree.js', 'browser/sqlite-worker.js'], bundle: true, splitting: true,
    format: 'esm', outdir: 'browser/dist', platform: 'browser', logLevel: 'info'});
// Gramlot's standalone host starts a classic Worker; its Page declarations run there.
const page = await build({metafile:true, entryPoints: ['browser/page-worker.js'], bundle: true,
    format: 'iife', outdir: 'browser/dist', platform: 'browser', logLevel: 'info'});
await copyFile('node_modules/wa-sqlite/dist/wa-sqlite-async.wasm', 'browser/dist/wa-sqlite-async.wasm');
for (const theme of ['gramlot-base', 'gramlot-compact', 'gramlot-index'])
    await cp(`node_modules/@gramlot/gramlot/themes/${theme}`, `browser/themes/${theme}`, {recursive: true});

// Only current build outputs: old esbuild chunks must not become offline dependencies.
async function files(dir) {
    const entries = await readdir(dir, {withFileTypes:true});
    return (await Promise.all(entries.map(e => e.isDirectory() ? files(`${dir}/${e.name}`) : `${dir}/${e.name}`))).flat();
}
const assets = [...new Set(['browser/index.html', 'browser/style.css',
    ...Object.keys(app.metafile.outputs), ...Object.keys(page.metafile.outputs),
    'browser/dist/wa-sqlite-async.wasm', ...await files('browser/themes')])].sort();
const {createHash} = await import('node:crypto');
const hash = createHash('sha256');
const template = await readFile('browser/service-worker.template.js', 'utf8');
hash.update(template);
for (const path of assets) { hash.update(path); hash.update(await readFile(path)); }
await writeFile('browser/service-worker.js',
    `const BUILD_VERSION=${JSON.stringify(hash.digest('hex'))};\nconst ASSETS=${JSON.stringify(assets.map(p=>p.slice(8)).map(p=>'/'+p))};\n` + template);
