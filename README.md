# Asqueel JS

[![npm](https://img.shields.io/npm/v/@asqueel/asqueel-js)](https://www.npmjs.com/package/@asqueel/asqueel-js)
[![Tests](https://github.com/asqueel-org/asqueel-js/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/asqueel-org/asqueel-js/actions/workflows/ci.yml)
[![Python parity](https://github.com/asqueel-org/asqueel-js/actions/workflows/python-parity.yml/badge.svg?branch=main)](https://github.com/asqueel-org/asqueel-js/actions/workflows/python-parity.yml)
[![Documentation](https://img.shields.io/readthedocs/asqueel-js?version=latest)](https://asqueel-js.readthedocs.io/en/latest/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-blue)](https://github.com/asqueel-org/asqueel-js/blob/main/package.json)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue)](https://github.com/asqueel-org/asqueel-js/blob/main/LICENSE)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/asqueel-org/asqueel-js/main/docs/_static/brand/asqueel-wordmark-inverse.svg">
  <img src="https://raw.githubusercontent.com/asqueel-org/asqueel-js/main/docs/_static/brand/asqueel-wordmark-primary.svg" alt="Asqueel" width="360">
</picture>

**Asqueel JS runs an [Asqueel](https://asqueel.readthedocs.io/en/latest/) data model on
SQLite from JavaScript:** in the browser on SQLite WebAssembly persisted in IndexedDB,
on Node.js and on Bun. It targets local applications that keep working without a network.

The model grammar, the query language and the behaviors are those of the Python
package; a model saved by Python in TYTX loads in JavaScript and the other way round.
The test suite compares every result with a pinned Python reference.

```sh
npm install @asqueel/asqueel-js
```

```js
import {defineModel} from '@asqueel/asqueel-js';
import {migrateSQLite} from '@asqueel/asqueel-js/sqlite';
import {openNodeSQLite} from '@asqueel/asqueel-js/adapters/node';

const model = defineModel(root => {
    const note = root.db({name: 'notes', implementation: 'sqlite'})
        .packages().package({name: 'app', sqlschema: 'main'}).table({name: 'note'});
    note.options().sysFields();
    note.column({name: 'body', dtype: 'T'});
});

const adapter = openNodeSQLite(':memory:');
await migrateSQLite(adapter, model.toMigration());
const notes = model.queries(adapter, {environment: {user: 'ada'}}).table('app.note');
await notes.insert({body: 'A local note'});
console.log(await notes.query({columns: '$body,$__ins_user'}).fetch());
await adapter.close();
```

## What it does

- **Models** with the Python grammar: packages, tables, relations, formulas, options,
  contributions and composition; saved and loaded as TYTX.
- **Queries** compiled to the SQL of the Python compiler: relations, formulas,
  subqueries, aggregations, `#THIS`, `#ENV`, `#TEMPLATE`, `#IN_RANGE`, `#PERIOD`.
- **Writes** through the Python write cycle: system fields, hooks, hierarchies,
  counters and `onUpdate` cascades, in transactions.
- **SQLite migrations**, additive and atomic.
- **Offline**: CSV/JSON/TYTX imports, Python → browser → Python snapshots, a single
  HTML file that works from `file://`.

Asqueel JS 0.2.0 is experimental: see
[status and limitations](https://asqueel-js.readthedocs.io/en/latest/reference/limitations.html).

## Documentation

The manual is on [Read the Docs](https://asqueel-js.readthedocs.io/en/latest/):
[quickstart](https://asqueel-js.readthedocs.io/en/latest/guide/quickstart.html),
[models](https://asqueel-js.readthedocs.io/en/latest/guide/models.html),
[queries](https://asqueel-js.readthedocs.io/en/latest/guide/queries.html),
[writes](https://asqueel-js.readthedocs.io/en/latest/guide/writes.html),
[browser and offline](https://asqueel-js.readthedocs.io/en/latest/guide/browser.html),
[parity with Python](https://asqueel-js.readthedocs.io/en/latest/reference/parity.html).
The sources are in [`docs/`](docs/).

## Development

```sh
npm ci
npm test                 # Node.js
npm run test:bun         # Bun
npx playwright install chromium
npm run test:browser     # SQLite WASM and IndexedDB in Chromium
npm run browser          # playground on http://127.0.0.1:8092
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the rules and [RELEASING.md](RELEASING.md)
for publication. Changes are listed in [CHANGELOG.md](CHANGELOG.md), plans in
[ROADMAP.md](ROADMAP.md).

## License

Apache-2.0. Copyright 2025-2026 Softwell S.r.l. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
