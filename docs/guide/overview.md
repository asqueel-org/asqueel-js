# Overview

Asqueel JS declares a database model and runs it on SQLite from JavaScript.
It is meant for small local applications: the browser first, then Node.js and Bun.
The data stays in a local SQLite database; the application keeps working without a network.

## Relation with Python Asqueel

Asqueel JS follows the [Python package](https://asqueel.readthedocs.io/en/latest/guide/overview.html).
The two packages share the model, not the code.

- **Same grammar.** `src/generated/grammar.json` is exported from the Python
  `SqlBuilder`. Element and attribute names are identical in both languages:
  see the [grammar reference](https://asqueel.readthedocs.io/en/latest/grammar.html).
- **Same model.** A model declared in JavaScript expands its options, resolves its
  relations and produces the same migration JSON as the Python package.
- **Same saved source.** `recipe.toTytx()` writes the recipe source in TYTX, as Python
  `recipe.source.to_tytx()` does. A file written by Python loads in JavaScript and
  the other way round.
- **Same SQL.** Queries and writes compile to the SQL text and parameters of the Python
  compiler on SQLite.
- **Verified.** The test suite compares JavaScript with a pinned Python reference:
  composed source, migration JSON, SQL, parameters, rows and write cycles.
  See {doc}`../reference/parity`.

The package does not run Python. Hooks, compiler callbacks and table methods are
JavaScript functions registered at run time.

## What runs where

| Runtime | SQLite engine | Entry point |
|---|---|---|
| Browser (Web Worker) | wa-sqlite 1.0.0, Asyncify build, IndexedDB VFS | `@asqueel/asqueel-js/adapters/browser` |
| Node.js 22.13 or later | `node:sqlite` | `@asqueel/asqueel-js/adapters/node` |
| Bun | `bun:sqlite` | `@asqueel/asqueel-js/adapters/bun` |

The model, the compiler and the migrations are the same code in the three runtimes.
Only the adapter changes. PostgreSQL is not supported.

## What is available

- Model declaration, composition of contributions, options and their expansion:
  {doc}`models`.
- Queries with formulas, relations, subqueries, aggregations and the `#THIS`,
  `#ENV`, `#TEMPLATE`, `#IN_RANGE`, `#PERIOD` macros: {doc}`queries`.
- The application write cycle: system fields, hooks, hierarchies, counters and
  `onUpdate` cascades, inside transactions: {doc}`writes`.
- Additive SQLite migrations: {doc}`sqlite`.
- CSV, JSON and TYTX file imports: {doc}`imports`.
- Source and record snapshots from Python to the browser and back: {doc}`transfers`.
- Offline browser use, including a single HTML file opened with `file://`: {doc}`browser`.

## Status

Asqueel JS 0.2.0 is experimental. It does not claim complete parity with Python.
{doc}`../reference/limitations` lists what is not ported. A declaration that the grammar
accepts but the runtime does not execute raises an explicit error; it is never ignored.
