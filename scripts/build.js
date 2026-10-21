import {build} from 'esbuild';
import {copyFile, cp, mkdir} from 'node:fs/promises';
await mkdir('browser/dist', {recursive: true});
await build({entryPoints: ['browser/app.js', 'browser/logic.js', 'browser/index-logic.js', 'browser/editors.js',
    'browser/layout.js', 'browser/tree.js', 'browser/sqlite-worker.js'], bundle: true, splitting: true,
    format: 'esm', outdir: 'browser/dist', platform: 'browser', logLevel: 'info'});
// Gramlot's standalone host starts a classic Worker; its Page declarations run there.
await build({entryPoints: ['browser/page-worker.js'], bundle: true,
    format: 'iife', outdir: 'browser/dist', platform: 'browser', logLevel: 'info'});
await copyFile('node_modules/wa-sqlite/dist/wa-sqlite-async.wasm', 'browser/dist/wa-sqlite-async.wasm');
await cp('node_modules/@gramlot/gramlot/themes/gramlot-base', 'browser/themes/gramlot-base', {recursive: true});
