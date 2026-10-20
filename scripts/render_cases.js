import {readFileSync} from 'node:fs';
import {sourceModel} from '../test/source-model.js';
import {defineModel} from '../src/index.js';
import {shop} from '../examples/shop.js';
import {application} from '../examples/application.js';

const cases = JSON.parse(readFileSync(new URL('../test/fixtures/application-cases.json', import.meta.url)));
const results = Object.fromEntries(cases.map(c => [c.name, sourceModel(c.source).toMigration()]));
results.shop = defineModel(shop).toMigration();
results.application = defineModel(application).toMigration();
process.stdout.write(JSON.stringify(results));
