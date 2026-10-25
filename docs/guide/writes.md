# Writes and transactions

`table.insert`, `table.update` and `table.delete` run the application write cycle of
Python Asqueel: protections and defaults, key assignment, validation, field triggers,
table hooks, SQL, then the after-triggers and after-hooks. See the Python pages
[Writes](https://asqueel.readthedocs.io/en/latest/guide/writes.html),
[Transactions](https://asqueel.readthedocs.io/en/latest/guide/transactions.html) and
[Hooks](https://asqueel.readthedocs.io/en/latest/guide/hooks.html).

## Records and transactions

```js
const db = model.queries(adapter);
await db.transaction(async tx => {
    const people = tx.table('notes.person');
    const record = await people.insert({id: 104, name: 'New person'});
    await people.update({name: 'Changed'}, {pkey: record.id});
    console.log(await people.query({where: '$id=:id', sqlparams: {id: record.id}}).fetchRecord());
    await people.delete(record.id);
});
```

- `insert` and `update` return the record passed in, completed with the values
  returned by SQL (database defaults, `sql_value`, generated columns). `delete`
  returns `undefined`.
- A call outside `transaction` opens its own transaction.
- Inside a transaction use the `tx` context and await every operation. An SQL error
  rolls back the whole transaction, also when the callback catches it. Nested
  transactions and use of the context after it closes raise an error.
- Operations through one adapter instance are serialized. Direct use of the adapter
  and migrations need coordination by the caller.
- `UPDATE` re-reads the record when protected fields or partitions need it and keeps
  the key of the old snapshot. Changes to `readOnly` or `unmodifiable` columns raise
  an error.
- `DELETE` with a string key re-reads the record and does nothing when it is missing;
  with an object it must delete exactly one row.

`model.queries().compile({operation: 'insert', ...})` and `execute(request)` are the
SQL level: they return the statement or the raw rows and refuse tables that need the
write cycle.

## System fields and hooks

```js
const model = defineModel(root => {
    const table = root.db({name: 'local', implementation: 'sqlite'})
        .packages().package('app').table('note');
    table.options().sysFields();
    table.column({name: 'title', dtype: 'T'});
});
await migrateSQLite(adapter, model.toMigration());
const db = model.queries(adapter, {
    environment: {user: 'ada'},
    hooks: {
        'app.note': {
            async trigger_onInserting(record) {
                record.title = record.title.trim();
            },
            async trigger_onUpdated(record, {old_record}) {
                // Further writes use this.db: they join the same transaction.
            },
        },
    },
});
const note = await db.table('app.note').insert({title: ' A note '});
await db.table('app.note').update({...note, title: 'Changed'}, {old_record: {...note}});
await db.table('app.note').delete(note.id);
```

- Hook names are the Python ones: `trigger_onInserting/Inserted`,
  `trigger_onUpdating/Updated`, `trigger_onDeleting/Deleted`, `protect_validate`,
  `protect_update`, `protect_delete`, `protect_draft`, `trigger_assignCounters`,
  `trigger_releaseCounters`, `newPkeyValue`. Use ordinary methods, not arrow
  functions, when they read `this`.
- Python keyword arguments arrive as the second object: `{old_record}`, or
  `{fldname, tblname, old_record}` for field triggers.
- A column declaring `onInserting: 'normalize'` calls `trigger_normalize`;
  `trigger_table` selects another registered table. A name without an implementation
  raises an error. The built-in `setTSNow` and `setCurrentUser` can be overridden.
- `this` exposes `db`, `model`, `fullname`, `currentUser` and `currentTrigger`.
- A failed validation, hook or statement makes the whole transaction rollback-only.
  Records already changed in memory by hooks are not restored, as in Python.
- `environment` is copied at the start of the transaction. `clock({table, field, dtype})`
  and `uuid()` can be injected for deterministic tests; they must be synchronous.
  The default key is the legacy22 identifier of `genro_toolbox.uid`; timestamps are
  UTC for `DHZ` and local for `DH`, as ISO strings with microseconds.

## Hierarchies and counters

```js
const model = defineModel(root => {
    const pkg = root.db({name: 'local', implementation: 'sqlite'}).packages().package('app');
    const category = pkg.table('category');
    category.options().sysFields();
    category.options().hierarchical({columns: 'code', root_id: true, virtual_roots: true});
    category.options().counter();
    category.column('code');
});
await migrateSQLite(adapter, model.toMigration());
const db = model.queries(adapter, {environment: {user: 'ada'}});
await db.transaction(async tx => {
    const category = tx.table('app.category');
    const first = await category.insert({code: 'first'});
    const second = await category.insert({code: 'second'});
    const child = await category.insert({code: 'child', parent_id: first.id});
    await category.update({id: child.id, parent_id: second.id}, {old_record: child});
});
```

- A move takes the last position among the new siblings, recomputes paths, `root_id`
  and `_h_count`, then updates the descendants through the normal write cycle.
- A hierarchical update needs `old_record`, re-read from the database before use.
  Cycles, unknown parents, key changes, invalid counters and positions beyond 1295
  raise an error.
- Deleting a node deletes its descendants; logical deletion propagates to them.
  `linked_to` creates and updates the root linked to the master record.
- `counter({field, scope})` takes the maximum of the group plus one, counting draft and
  archived rows; NULL is a group of its own. In a hierarchy the group is the parent.
- `relidx('master_id')` keeps the counter in the `<master>_xtd` extension table; a
  number is never reused. A rollback also undoes the allocation.

## Application `onUpdate` cascades

```js
child.column('parent_code').relation('app.parent.code', {
    onUpdate: 'cascade',
    onUpdate_sql: 'no action',
    deferred: true,
});
await db.table('app.parent').update({...oldParent, code: 'new'}, {old_record: oldParent});
```

- `cascade` updates each child through `table.update`, with its protections, triggers
  and hooks, in the same transaction. The children's after-hooks run before the
  parent's. An error in any descendant rolls everything back.
- `raise` refuses the change when children exist; `ignore` leaves them, and the SQL
  constraints still apply.
- `onUpdate_sql` is the SQLite action and defaults to cascade. When SQLite has already
  propagated the value, the application finds no child and runs no hook. Use
  `onUpdate_sql: 'no action'` with `deferred: true` to cascade through the write cycle.

Actions on composite relations are not ported and raise an error.
