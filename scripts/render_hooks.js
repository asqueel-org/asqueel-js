import {nativeSQLite} from '../test/native-sqlite.js';
import {hooksModel, runHookCase} from '../test/hooks-runner.js';
import inputs from '../test/hooks-inputs.json' with {type: 'json'};
import oracle from '../test/fixtures/hooks.json' with {type: 'json'};
import {legacy22} from '../src/write-runtime.js';
const cases = [];
for (const input of inputs) {
    const adapter = nativeSQLite();
    try { cases.push({name: input.name, input, expected: await runHookCase(adapter, input)}); }
    finally { await adapter.close(); }
}
process.stdout.write(JSON.stringify({source: hooksModel.toTytx(), desired: hooksModel.toMigration(),
    ids: oracle.ids.map(v => ({...v, expected: legacy22(v.milliseconds, Uint8Array.from(v.bytes))})), cases}));
