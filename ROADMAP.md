# Roadmap

The first goal is a small local application that really works without a network.
Coverage of the Asqueel features that apply to SQLite grows in verifiable steps.
This roadmap never declares a feature supported only because the grammar contains it.

## 0. Independent base

- [x] Import the PoC keeping the grammar and independent Python oracles.
- [x] Separate the browser, Node.js and Bun adapter entry points.
- [x] Reproducible installation with a lockfile.
- [x] Automated real SQLite checks in Chromium, besides Node.js and Bun.
- [x] Document the adapter contract, the limits and the Python verification method.
- [x] CI for Node.js 22/24, Bun, Chromium and Python parity on pinned revisions.

## 1. Portable declarative model · Python 0.7.0 · `84408eb`

- [x] Grammar, examples and verifier aligned to Python commit `84408eb`.
- [x] Legacy option names, `relation(related_column)`, packages only, no `x_*`.
- [x] Recipe source in TYTX (`SqlSourceBag`), loadable from Python and JavaScript.
- [x] Ordered contributions, conflicts, copies, resets and independent composition.
- [x] Hierarchical model, physical and virtual columns, option metadata.
- [x] Column groups, direct and inverse relations, aliases, virtualRelation declarations.
- [x] Structural validation, types, references, indexes and physical names.
- [x] Composed source and migration compared with Python on Node.js, Bun and the browser.
- [x] Withdraw `subtable`, the `partition`/`tenant` options and old attributes, as Python.

## 2. CRUD for small applications

- [x] UPDATE and DELETE with parameters, automatic RETURNING and selection by primary key.
- [x] Single-record read, count and exists with defined semantics.
- [x] Transaction API for atomic multi-write units; no implicit internal commits.
- [ ] Identifiable errors for a missing record, a constraint and an unsupported feature.
- [ ] A worker API usable by an application without the playground.

## 3. Offline start and use

- [x] Versioned cache of HTML, JavaScript, themes, worker and WASM in the playground.
- [x] First start online, CRUD, Chromium restart without network with the same profile;
      model and data recovery and return of the real snapshot to Python.
- [x] A single HTML file exported by Gramlot, opened from `file://` with no first online start.
- [ ] Coordinate asset updates with the version of the local schema.
- [x] CSV/JSON/TYTX import through `sql_insert`, with Python parity and browser checks.
- [x] Python → browser → Python snapshots: partial sources and TYTX data.
- [ ] Explicit handling of quota errors during import, export and persistence.
- [ ] Several open tabs and concurrent requests through the worker API.
- [ ] Qualify Chromium, Firefox and WebKit; declare only verified browsers.

## 4. Application behaviors

- [ ] Codecs with declared semantics for dates, timestamps, decimals and JSON/Bag.
- [x] Defaults and basic protections, respecting missing fields and NULL.
- [x] `sysFields`: identifiers, timestamps and users, with injectable sources in tests.
- [x] Before/after hooks and consistent rollback, also of nested writes.
- [x] Hierarchies: paths, moves, inheritance, linked roots and deletion of descendants.
- [x] `counter` per group and `relidx`, with rollback and IndexedDB checks.
- [x] Application `onUpdate` cascades on physical columns, nested hooks, raise/ignore.
- [x] Formula and alias columns, GROUP BY/HAVING/DISTINCT aggregations.
- [x] Computed reads: local formula parameters, `#THIS`, `#ENV`, composite columns.

## 5. SQLite schema evolution

- [ ] Table rebuilds with data copy and verification.
- [ ] Changes of defaults, types, constraints and indexes with clear preconditions.
- [ ] Recoverable failed migrations, without partial changes.
- [ ] Documented format versions and upgrade compatibility.

## 6. Towards full coverage

- [ ] An inventory of every Python capability with its JavaScript status.
- [x] Scalar/EXISTS subqueries, `subQueryColumn` and aggregations over inverse and virtual relations.
- [x] Formula/env/subquery callbacks and dynamic virtual columns.
- [x] `#TEMPLATE` and `#IN_RANGE`.
- [x] `#PERIOD` through `@genrojs/toolbox`.
- [ ] `#BAG`/`#BAGCOLS` and result metadata.
- [ ] Partitions and other options; actions on composite relations.
- [ ] A stable public API and TypeScript declarations.
- [x] Application documentation on Read the Docs.

Synchronization with a server and conflict resolution need a dedicated contract; they
are not implied by offline work. Server database dialects are a later product decision;
the initial target of the three runtimes is SQLite.

## Rule for every step

Model → compilation → execution → reopen: verify the whole affected path. Compare with
Python whatever is deterministic; for identifiers, clocks and hooks verify format,
order and effects with controlled dependencies. A capability that is not implemented
raises an explicit error, never a silent degradation.
