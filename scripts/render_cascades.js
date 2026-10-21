import {nativeSQLite} from '../test/native-sqlite.js';
import {cascadesModel, runCascadeCase} from '../test/cascades-runner.js';
import inputs from '../test/cascades-inputs.json' with {type: 'json'};
const cases = [];
for (const input of inputs) {
    const adapter = nativeSQLite();
    try { cases.push({name: input.name, input, expected: await runCascadeCase(adapter, input)}); }
    finally { await adapter.close(); }
}
process.stdout.write(JSON.stringify({model: cascadesModel.toJSON(), desired: cascadesModel.toMigration(), cases}));
