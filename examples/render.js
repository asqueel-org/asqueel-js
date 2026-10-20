import {mkdirSync, writeFileSync} from 'node:fs';
import {defineModel} from '../src/index.js';
import {shop} from './shop.js';
import {application} from './application.js';

const useApplication = process.argv.includes('--application');
const result = defineModel(useApplication ? application : shop).toMigration();
if (process.argv.includes('--stdout')) {
    process.stdout.write(JSON.stringify(result));
} else {
    const path = new URL(`../output/${useApplication ? 'application-migration' : 'migration'}.json`, import.meta.url);
    mkdirSync(new URL('../output/', import.meta.url), {recursive: true});
    writeFileSync(path, JSON.stringify(result, null, 2) + '\n');
    console.log(`Migration structure: ${path.pathname}`);
}
