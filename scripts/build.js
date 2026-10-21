import {build} from 'esbuild';
import {copyFile, mkdir} from 'node:fs/promises';
await mkdir('browser/dist', {recursive: true});
await build({entryPoints: ['browser/app.js', 'browser/logic.js', 'browser/editors.js', 'browser/sqlite-worker.js'], bundle: true,
    format: 'esm', outdir: 'browser/dist', platform: 'browser', logLevel: 'info'});
// Gramlot's standalone host starts a classic Worker; its Page declarations run there.
await build({entryPoints: ['browser/page-worker.js'], bundle: true,
    format: 'iife', outdir: 'browser/dist', platform: 'browser', logLevel: 'info'});
await copyFile('node_modules/wa-sqlite/dist/wa-sqlite-async.wasm', 'browser/dist/wa-sqlite-async.wasm');
