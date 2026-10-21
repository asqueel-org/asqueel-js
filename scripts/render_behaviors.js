import {nativeSQLite} from '../test/native-sqlite.js';
import {behaviorsModel, runBehaviorCase} from '../test/behaviors-runner.js';
import inputs from '../test/behaviors-inputs.json' with {type: 'json'};
const cases = [];
for (const input of inputs) {
    const adapter = nativeSQLite();
    try { cases.push({name: input.name, input, expected: await runBehaviorCase(adapter, input)}); }
    finally { await adapter.close(); }
}
process.stdout.write(JSON.stringify({model: behaviorsModel.toJSON(), desired: behaviorsModel.toMigration(), cases}));
