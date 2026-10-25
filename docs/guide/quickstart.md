# Quickstart

This example declares two tables, creates them in an in-memory SQLite database on
Node.js, writes two records in a transaction and reads them back through a relation.

```js
import {defineModel} from '@asqueel/asqueel-js';
import {migrateSQLite} from '@asqueel/asqueel-js/sqlite';
import {openNodeSQLite} from '@asqueel/asqueel-js/adapters/node';

const model = defineModel(root => {
    const app = root.db({name: 'notes', implementation: 'sqlite'})
        .packages().package({name: 'app', sqlschema: 'main'});
    const author = app.table({name: 'author', pkey: 'id'});
    author.column({name: 'id', dtype: 'I'});
    author.column({name: 'name', dtype: 'T', notnull: true});
    const note = app.table({name: 'note'});
    note.options().sysFields();
    note.column({name: 'body', dtype: 'T'});
    note.column({name: 'author_id', dtype: 'I'})
        .relation({related_column: 'app.author.id', relation_name: 'notes'});
});

const adapter = openNodeSQLite(':memory:');
try {
    await migrateSQLite(adapter, model.toMigration());
    const db = model.queries(adapter, {environment: {user: 'ada'}});
    await db.transaction(async tx => {
        await tx.table('app.author').insert({id: 1, name: 'Ada'});
        await tx.table('app.note').insert({body: 'A local note', author_id: 1});
    });
    const rows = await db.table('app.note').query({
        columns: '$body,@author_id.name AS author,$__ins_user',
        order_by: '$__ins_ts',
    }).fetch();
    console.log(rows); // [{body: 'A local note', author: 'Ada', __ins_user: 'ada'}]
} finally {
    await adapter.close();
}
```

What happens:

1. `defineModel` declares the model. Declarations take an attributes object; the
   names are those of the [Python grammar](https://asqueel.readthedocs.io/en/latest/grammar.html).
2. `sysFields()` adds the system columns: `id` as primary key, insert and update
   timestamps and users, logical deletion. They are filled by the write cycle.
3. `model.toMigration()` renders the migration JSON; `migrateSQLite` creates the
   tables, constraints and indexes.
4. `model.queries(adapter, runtime)` binds the model to the database. `runtime.environment`
   supplies the values the model reads, here the current user.
5. `table.insert` runs the application write cycle inside the transaction.
6. `@author_id.name` follows the relation with a JOIN.

On Bun replace the adapter with `openBunSQLite` from
`@asqueel/asqueel-js/adapters/bun`. In the browser the same code runs in a worker
with `openBrowserSQLite`: see {doc}`browser`.

## Save and reload the model

```js
import {SqlBuilder} from '@asqueel/asqueel-js';

const saved = model.toTytx();              // the recipe source in TYTX
const reloaded = SqlBuilder.fromTytx(saved);
reloaded.toMigration();                    // same migration JSON
```

A source saved by Python with `recipe.source.to_tytx()` loads the same way.

## Next steps

- {doc}`models`: declarations, options, contributions and composition.
- {doc}`queries`: the query API and the macros.
- {doc}`writes`: transactions, hooks, hierarchies and counters.
