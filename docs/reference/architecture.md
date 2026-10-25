# Architecture

One ES module package with separate entry points per runtime. The boundaries are
modules and contracts, not separate packages.

## Data path

```{mermaid}
flowchart LR
    G[grammar.json] --> B[SqlBuilder]
    B --> C[composition.js<br/>contributions]
    C --> P[model.js prepare<br/>model-options.js expansion]
    P --> M[DbModel]
    P --> J[migration.js<br/>structure-1.0]
    J --> S[sqlite.js<br/>plan and apply]
    M --> Q[queries.js<br/>select and write compilers]
    Q --> A[adapter]
    S --> A
```

1. `SqlBuilder` loads `src/generated/grammar.json` through `@genrojs/builders`.
   The source class is `SqlSourceBag` (`source-bag.js`), saved and loaded in TYTX.
2. `composition.js` keeps the declarations and composes the contributions.
3. `model.js` prepares the source: signature defaults, package types, option
   expansions (`model-options.js`) and references. From the prepared source it builds
   the hierarchical `DbModel` and the relation registry.
4. `migration.js` renders the same prepared source as `structure-1.0`, as the Python
   `SqlMigrationRenderer` does; `structures.js` ports the asqueel-migration factories.
5. `sqlite.js` reads the real catalog and plans and applies the supported differences.
6. `queries.js`, `select-compiler.js` and `write-compiler.js` compile requests;
   `write-runtime.js` and `table-behaviors.js` run the application write cycle.
7. An adapter runs the SQL on the SQLite engine of the runtime.

Name resolution is shared by queries and migrations. The authored source is never
mutated. The grammar describes declarations; it does not replace the algorithms that
implement their effects.

## Transactions and concurrency

`SqliteQueries` serializes its operations on one adapter instance and offers
`transaction(callback)`. `migrateSQLite` runs one transaction per migration. Direct use
of the adapter must be serialized by the caller. In the playground a queue in the worker
and Web Locks do this. Nested `BEGIN` statements are never issued.

## Library and playground

`src/` is the library. `browser/` is a development tool: the code editor, RPC, sample
data and Python references do not define the API of an application. The main entry point
imports no Node.js or Bun driver, no DOM API and no WASM module. Gramlot is a development
dependency of the playground only.

## Compatibility rules

- The model crosses the worker boundary as data; the worker recompiles the request.
- SQL expressions are application code; user values travel as parameters.
- A declaration the grammar accepts but the runtime does not execute raises an error.
- The migration JSON keeps the `structure-1.0` vocabulary of the migrator; it is not a
  second public form of the Python model.
- The runtime works on one `DbModel`, also when the recipe was loaded from a TYTX source
  written by Python.
