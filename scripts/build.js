import {build} from 'esbuild';
import {copyFile, mkdir} from 'node:fs/promises';
await mkdir('browser/dist', {recursive: true});
await build({entryPoints: ['browser/app.js', 'browser/sqlite-worker.js'], bundle: true,
    format: 'esm', outdir: 'browser/dist', platform: 'browser', logLevel: 'info'});
await copyFile('node_modules/wa-sqlite/dist/wa-sqlite-async.wasm', 'browser/dist/wa-sqlite-async.wasm');
