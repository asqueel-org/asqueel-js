# SQLite migrations and adapters

## The migration JSON

`model.toMigration()` returns the `structure-1.0` JSON consumed by
[asqueel-migration](https://asqueel.readthedocs.io/en/latest/guide/migrations.html).
It is rendered from the prepared source, as the Python `SqlMigrationRenderer` does:

- only the physical plane travels: schemas, tables, columns, primary keys, unique and
  check constraints, foreign keys and indexes, under their SQL names;
- virtual columns and UI attributes never reach it;
- `indexed` columns, relation columns and non-key relation targets get an index;
- `unique` on a `compositeColumn` becomes a UNIQUE constraint;
- structural names are the same MD5 hashes as asqueel-migration.

`model.toMigration({foreignKeys: false})` omits the foreign keys and keeps their indexes.

## Applying a migration

```js
import {migrateSQLite, planSQLite, readSQLite} from '@asqueel/asqueel-js/sqlite';

const plan = await planSQLite(adapter, model.toMigration());   // {statements, blocked, warnings, current}
const result = await migrateSQLite(adapter, model.toMigration());
result.executed;   // the statements applied
```

`migrateSQLite` runs inside `BEGIN IMMEDIATE`: it recomputes the plan, applies it,
reads the catalog back, requires an empty residual diff and a clean
`PRAGMA foreign_key_check`, then commits. Any error rolls back. `readSQLite` reads the
live catalog as `structure-1.0`.

The JavaScript migrator is additive and works on the `main` schema:

- **supported:** new tables (also with composite keys, UNIQUE and deferrable foreign
  keys), new nullable columns, new non-unique indexes, also partial and ordered;
- **refused with an explicit error:** removals, changes of type, default or
  constraints, CHECK constraints added later, generated columns, views, triggers,
  collations, expression indexes and explicit UNIQUE indexes.

Use `unique` on the column or a UNIQUE constraint instead of a UNIQUE index, and `I`
for integer primary keys. Physical constraint names are ignored in the diff, as in the
Python default. Table rebuilds are not implemented. For anything beyond these rules use
asqueel-migration from Python.

## The adapter contract

```js
await adapter.query(sql, params);    // array of records, keyed by column name
await adapter.execute(sql, params);  // no public result
await adapter.close();
```

`params` is an array for positional placeholders or an object with prefixed names,
for example `{':id': 1}`. The compiler returns names without prefix; the execution
boundary adapts them and binds booleans as 0/1 and safe JavaScript integers as SQLite
INTEGER. Adapters enable foreign keys. They decide no migration, policy or hook.

| Adapter | Engine | Notes |
|---|---|---|
| `openNodeSQLite(filename)` | `node:sqlite` | synchronous driver behind the async contract |
| `openBunSQLite(filename)` | `bun:sqlite` | synchronous driver behind the async contract |
| `openBrowserSQLite(name, {wasmBinary})` | wa-sqlite 1.0.0, Asyncify, `IDBBatchAtomicVFS` | runs in a Web Worker; see {doc}`browser` |

The Node.js and Bun adapters do not move work to another thread.
