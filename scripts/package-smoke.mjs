import assert from 'node:assert/strict';
import {defineModel} from '@asqueel/asqueel-js';
import {migrateSQLite} from '@asqueel/asqueel-js/sqlite';

const adapter = process.versions.bun
  ? (await import('@asqueel/asqueel-js/adapters/bun')).openBunSQLite(':memory:')
  : (await import('@asqueel/asqueel-js/adapters/node')).openNodeSQLite(':memory:');
const model = defineModel(root => {
  const table = root.db('notes').packages()
    .package({name: 'app', sqlschema: 'main', sqlprefix: 'app'}).table('note', {pkey: 'id'});
  table.column('id', {dtype: 'I'});
  table.column('body', {dtype: 'T'});
});
try {
  await migrateSQLite(adapter, model.toMigration());
  const notes = model.queries(adapter).table('app.note');
  await notes.insert({id: 1, body: 'Installed release'});
  const rows = await notes.query({columns: '*', order_by: '$id'}).fetch();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].body, 'Installed release');
  await migrateSQLite(adapter, model.toMigration());
  assert.equal((await notes.query({columns: '*'}).fetch()).length, 1);
  console.log(`${process.versions.bun ? 'Bun' : 'Node'}: installed package and SQLite migration passed`);
} finally {
  await adapter.close();
}
