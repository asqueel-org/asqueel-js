import cases from '../test/fixtures/composition.json' with {type: 'json'};
import {evaluateComposition} from '../test/composition-cases.js';
process.stdout.write(JSON.stringify(cases.map(entry => ({name: entry.name, result: evaluateComposition(entry)}))));
