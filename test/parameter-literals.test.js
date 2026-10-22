import test from 'node:test';
import assert from 'node:assert/strict';
import {QueryBindings} from '../src/query-bindings.js';
import {prepareParameters, driverParameters} from '../src/sql-parameters.js';
import {nativeSQLite} from './native-sqlite.js';

for (const protectedText of ["'doc:xyz'", "'it''s :xyz'", '"doc:xyz"', '`doc:xyz`', '[:xyz]', '-- :xyz\r', '/* :xyz */']) {
    test(`named bindings preserve ${protectedText}`, () => {
        const bindings = new QueryBindings({xyz:'caller'}).child({xyz:'bound'}, 'f');
        const sql = `${protectedText} || :xyz || :xyz`;
        assert.equal(bindings.substitute(sql), `${protectedText} || :f1_xyz || :f1_xyz`);
    });
}
test('SQLite executes literals, scoped bindings, comments and adjacent parameters', async () => {
    const bindings = new QueryBindings().child({xyz:'bound'}, 'f');
    const sql = bindings.substitute("SELECT 'doc:xyz' || :xyz, :a+:b, ':env_secret' /* :missing */");
    const compiled = prepareParameters(sql, {...bindings.params, a:1, b:2}, {secret:'hidden'});
    assert.deepEqual(compiled.params, {f1_xyz:'bound', a:1, b:2});
    const db = nativeSQLite();
    try { assert.deepEqual(Object.values((await db.query(compiled.sql, driverParameters(compiled)))[0]), ['doc:xyzbound', 3, ':env_secret']); }
    finally { await db.close(); }
});
test('collection expansion and escaped colons preserve literal text', () => {
    const compiled = prepareParameters("SELECT 'IN :ids', 1 IN :ids, 'doc\\:xyz' -- IN :ids", {ids:[1,2]});
    assert.equal(compiled.sql, "SELECT 'IN :ids', 1 IN (:ids0,:ids1) , 'doc:xyz' -- IN :ids");
    assert.deepEqual(compiled.params, {ids0:1, ids1:2});
});
