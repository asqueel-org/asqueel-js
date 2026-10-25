# API reference

## `@asqueel/asqueel-js`

### Building a model

| Name | Description |
|---|---|
| `defineModel(populate)` | New `SqlBuilder`; calls `populate(root, builder)` and returns the builder. |
| `composeModels(...builders)` | New builder composing the inputs, from the base to the most specific. |
| `class SqlBuilder` | The model builder, with the grammar exported from Python. Subclass it with `main(root)` and call `create()`. |
| `class SqlDatabaseConfig` | `SqlBuilder` with the configuration grammar: connections and driver options. |
| `class SqlSourceBag` | The source class, registered as a TYTX subtype under the Python name. |

### `SqlBuilder` methods

| Method | Returns |
|---|---|
| `resolve()` | The `DbModel`. Checks the main connection settings. |
| `validateModel()` | The builder, after a successful resolution. |
| `toMigration({foreignKeys = true})` | The `structure-1.0` migration JSON. |
| `toTytx()` | The recipe source as TYTX text. |
| `SqlBuilder.fromTytx(text)` | A `SqlDatabaseConfig` rebuilt by replaying the saved `db` node. |
| `queries(adapter = null, runtime = {})` | An `SqliteQueries` bound to the adapter. |
| `contribution(name, callback)` | The callback result; declarations are recorded under `name`. |
| `node(path)` | The source node at `path`, as a declaration handle. |
| `clone()` | A copy with the same attribute origins. |
| `toSource()` | A plain snapshot of the source nodes. |

### Resolved model

| Name | Description |
|---|---|
| `resolveModel(builder)` | Same as `builder.resolve()`; returns a `DbModel` unchanged. |
| `class DbModel` | `tables` (a `Map`), `table('pkg.table')`, `package(name)`, `column('pkg.table.column')`, `relations`, `queries(adapter, runtime)`, `toMigration(options)`. |
| `class ModelNode` | A node of the resolved tree: `get`, `keys`, `values`, `items`, `at`, `column(path)`, `columns`, `virtual_columns`, `composites`, `indexes`, `relations`, `pkey`, `pkeys`, `sqlname`, `sqlschema`, `dtype`, `fullname`. |

### Errors

`RecordNotFoundError`, `RecordMultipleRowsError`, `TransactionStateError`,
`UnsupportedFeatureError`.

## `SqliteQueries`

Created by `model.queries(adapter, runtime)`.

`runtime` keys: `environment` (object or function), `hooks` (`{table: {method}}`),
`methods` (`{table: {callback}}`), `clock`, `uuid`.

| Member | Description |
|---|---|
| `table(name)` | A table handle (below). |
| `transaction(async tx => ...)` | Runs the callback in one SQLite transaction; `tx` has the same members. |
| `compile(request)` | `{sql, params}` of a `select`, `count`, `insert`, `update` or `delete` request. |
| `execute(request)` | Raw rows of the compiled request. |
| `model` | The `DbModel`. |
| `currentUser`, `currentTrigger` | Values of the running write cycle. |

### Table handle

| Member | Description |
|---|---|
| `query(options)` | `{compiled, fetch(), fetchRecord(ignoreMissing), count(), exists()}`. Options: `columns`, `where`, `sqlparams`, `order_by`, `limit`, `offset`, `distinct`, `group_by`, `having`, `addPkeyColumn`, `for_update`, `exclude_draft`, `exclude_logical_deleted`, `ignore_partition`, `environment`. |
| `insert(record, options)` | The record, completed with SQL-returned values. |
| `update(record, options)` | Same. Options: `pkey`, `old_record`, `ignore_partition`, `environment`. |
| `delete(keyOrRecord, options)` | `undefined`. |
| `sql_insert(source, {format, adapt})` | Imports CSV, JSON or TYTX: see {doc}`../guide/imports`. |
| `adaptRecord(record)` | The record adapted to the column types. |

## `@asqueel/asqueel-js/sqlite`

| Function | Description |
|---|---|
| `migrateSQLite(adapter, structure)` | Applies the plan atomically; `{executed, warnings, current, residual}`. |
| `planSQLite(adapter, structure)` | `{statements, blocked, warnings, current}` without changing the database. |
| `readSQLite(adapter, dbname)` | The live catalog as `structure-1.0`. |

## Adapters

| Import | Function |
|---|---|
| `@asqueel/asqueel-js/adapters/node` | `openNodeSQLite(filename = ':memory:')` |
| `@asqueel/asqueel-js/adapters/bun` | `openBunSQLite(filename = ':memory:')` |
| `@asqueel/asqueel-js/adapters/browser` | `openBrowserSQLite(name, {wasmBinary})` (async) |

Every adapter exposes `query(sql, params)`, `execute(sql, params)` and `close()`.

## `@asqueel/asqueel-js/transfer`

| Function | Description |
|---|---|
| `readTransfer(bundle)` | Validates a bundle and returns its builder, without I/O. |
| `importTransfer(adapter, bundle)` | Migrates and loads the records; `{builder, counts}`. |
| `exportTransfer(adapter, builder, {tables})` | A bundle with the source and the records of the chosen tables. |
