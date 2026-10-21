import {shop} from '../examples/shop.js';
import {application} from '../examples/application.js';
import shopExpected from '../test/fixtures/shop.json' with {type: 'json'};
import applicationExpected from '../test/fixtures/application.json' with {type: 'json'};
import {browserSqlite, browserSqliteV2} from '../examples/browser-sqlite.js';
import sqliteExpected from '../test/fixtures/sqlite.json' with {type: 'json'};
import {browserQueries} from '../examples/browser-queries.js';
import queriesExpected from '../test/fixtures/queries.json' with {type: 'json'};
import {groupedItems} from '../examples/groups.js';
import modelExamples from '../test/fixtures/model-examples.json' with {type:'json'};
import {virtualRelations} from '../examples/virtual-relations.js';

export const examples = {
    'virtual-relations': {recipe: virtualRelations, expected: modelExamples['virtual-relations'].migration},
    groups: {recipe: groupedItems, expected: modelExamples.groups.migration},
    queries: {recipe: browserQueries, expected: queriesExpected.desired},
    sqlite: {recipe: browserSqlite, expected: sqliteExpected.v1.desired},
    'sqlite-v2': {recipe: browserSqliteV2, expected: sqliteExpected.v2.desired},
    application: {recipe: application, expected: applicationExpected},
    shop: {recipe: shop, expected: shopExpected},
};
const canonical = value => value && typeof value === 'object'
    ? Array.isArray(value) ? value.map(canonical)
        : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value;

export function diff(a, b, path = '$') {
    if (JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))) return [];
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
        return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
            .flatMap(key => diff(a[key], b[key], `${path}.${key}`));
    }
    const value = v => v === undefined ? '(assente)' : JSON.stringify(v);
    return [`${path}\n  JavaScript: ${value(a)}\n  Python:     ${value(b)}`];
}


export {modelExamples};
