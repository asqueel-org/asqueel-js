// Install only the packed/published package, outside the source checkout.
import assert from 'node:assert/strict';
import {mkdtempSync, copyFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';

const spec = process.argv[2];
if (!spec) throw new Error('Usage: node scripts/check-package.mjs <tarball|name@version>');
const root = fileURLToPath(new URL('../', import.meta.url));
const expected = JSON.parse(readFileSync(join(root, 'package.json')));
const consumer = mkdtempSync(join(tmpdir(), 'asqueel-package-'));
try {
  const target = spec.endsWith('.tgz') ? resolve(spec) : spec;
  execFileSync('npm', ['install', '--prefix', consumer, '--ignore-scripts', '--no-audit',
    '--no-fund', '--save-exact', '--registry=https://registry.npmjs.org', target], {stdio: 'inherit'});
  const installed = JSON.parse(readFileSync(join(consumer, 'node_modules', expected.name, 'package.json')));
  assert.equal(installed.name, expected.name);
  assert.equal(installed.version, expected.version);
  copyFileSync(join(root, 'scripts/package-smoke.mjs'), join(consumer, 'check.mjs'));
  for (const runtime of ['node', 'bun']) {
    execFileSync(runtime, ['check.mjs'], {cwd: consumer, stdio: 'inherit'});
  }
  await build({
    absWorkingDir: consumer,
    stdin: {contents: `export {defineModel} from '${expected.name}';
      export {migrateSQLite} from '${expected.name}/sqlite';
      export {openBrowserSQLite} from '${expected.name}/adapters/browser';`, resolveDir: consumer},
    bundle: true, platform: 'browser', format: 'esm', write: false,
  });
  console.log('Installed browser entry points bundle successfully');
} finally {
  rmSync(consumer, {recursive: true, force: true});
}
