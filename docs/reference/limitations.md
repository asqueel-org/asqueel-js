# Status and limitations

Asqueel JS 0.2.0 is experimental. This page lists what is available and what is not
ported. A declaration outside this list raises an explicit error: nothing is ignored.

| Area | Available | Not available |
|---|---|---|
| Model | Python grammar, contributions, composition, options and expansions, hierarchy, relations, aliases, column groups, virtualRelation declarations, source saved in TYTX | Python package folders (`package({path})`), Python callables |
| SQLite schema | New tables with PK, UNIQUE and FK, new nullable columns, non-unique indexes | Rebuilds, alter or drop, later CHECK, generated columns in the JS migrator |
| Writes | INSERT, UPDATE, DELETE by key (also composite), SQL defaults, `sql_value`, RETURNING, transactions | Bulk writes and writes on a selection |
| Write cycle | `sysFields`, legacy22 keys, timestamps and users, defaults, protected fields, hooks and nested writes, hierarchies, `counter`, `relidx`, `onUpdate` cascade/raise/ignore | Other options, actions on composite relations, a mutable thread-local environment |
| Reads | Formulas with local parameters, `#THIS`, `#ENV`, `#TEMPLATE`, `#IN_RANGE`, `#PERIOD`, composite columns, direct JOINs, aggregations, subqueries, `aggr()` over inverse relations and virtualRelation, compiler callbacks | `#BAG`/`#BAGCOLS`, result metadata, application codecs, JOIN through a many relation, `ask` |
| Row policies | Draft and logical deletion on reads; partitions with an explicit environment | Full contextual application environment |
| Imports | CSV, JSON, TYTX in blocks, adaptation, keys, SQL defaults, rollback | Bag codec, ISO week dates, offsets with seconds, numbers beyond JavaScript limits |
| Browser | SQLite WASM in a worker, IndexedDB, reopen, single HTML file, offline playground | Public worker API, crash and quota guarantees, multi-tab concurrency guarantees |
| Runtimes | Node.js, Bun and Chromium run the same contracts; Safari desktop verified for the single HTML file | Firefox, mobile Safari and tablets are not qualified |

## Notes

- `compile` and `execute` are the SQL level and refuse tables that need the write
  cycle: use the table methods.
- Generated columns are verified on schemas created by the Python migrator: the JS
  renderer produces the right JSON, the JS SQLite migrator refuses them.
- `subtable` and the `partition`/`tenant` options are withdrawn, as in Python.
- The wa-sqlite IndexedDB VFS is an example implementation; normal execution,
  constraints, rollback and reopen are verified, crashes and storage eviction are not.
- Synchronization with a server and conflict resolution are not part of the package.

The planned work is in the [roadmap](https://github.com/asqueel-org/asqueel-js/blob/main/ROADMAP.md).
