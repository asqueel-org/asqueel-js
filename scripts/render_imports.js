import {nativeSQLite} from '../test/native-sqlite.js';
import {importsModel, runImportCase} from '../test/import-runner.js';
import inputs from '../test/import-inputs.json' with {type:'json'};
const cases = [];
for (const input of inputs) {
    const adapter = nativeSQLite();
    try {cases.push({name:input.name, input, expected: await runImportCase(adapter, input)});}
    finally {await adapter.close();}
}
process.stdout.write(JSON.stringify({model:importsModel.toJSON(), desired:importsModel.toMigration(), cases}));
