# Installation

```sh
npm install @asqueel/asqueel-js
```

The package is plain ES modules. It contains the model, the compiler, the SQLite
migrator, the runtime adapters and the grammar exported from Python. It does not
need Python and has no build step.

## Requirements

- Node.js 22.13 or later (`node:sqlite`), or Bun.
- In the browser: a Web Worker, IndexedDB and Web Locks in a secure context
  (HTTPS or `localhost`), or a page opened from `file://` with the WASM bytes
  embedded (see {doc}`browser`).

## Entry points

| Import | Content |
|---|---|
| `@asqueel/asqueel-js` | `defineModel`, `composeModels`, `SqlBuilder`, `SqlDatabaseConfig`, `SqlSourceBag`, `resolveModel`, `DbModel`, error classes |
| `@asqueel/asqueel-js/sqlite` | `migrateSQLite`, `planSQLite`, `readSQLite` |
| `@asqueel/asqueel-js/adapters/node` | `openNodeSQLite(filename)` |
| `@asqueel/asqueel-js/adapters/bun` | `openBunSQLite(filename)` |
| `@asqueel/asqueel-js/adapters/browser` | `openBrowserSQLite(name, {wasmBinary})` |
| `@asqueel/asqueel-js/transfer` | `readTransfer`, `importTransfer`, `exportTransfer` |

The main entry point imports no driver, no DOM API and no WASM module.

## Dependencies

| Package | Use |
|---|---|
| `@genrojs/builders`, `@genrojs/bag`, `@genrojs/tytx` | grammar loading, source Bag, TYTX encoding |
| `@genrojs/toolbox` | natural-language dates of `#PERIOD` |
| `wa-sqlite` | SQLite WebAssembly for the browser adapter |
| `@noble/hashes` | structural hashes of the migration JSON |

The Genro packages are declared with a minimum version and no upper bound.

## Browser bundles

The browser adapter loads `wa-sqlite/dist/wa-sqlite-async.wasm`. Bundle your worker
with the adapter and serve the WASM file next to the bundle, or pass its bytes as
`wasmBinary`. {doc}`browser` shows both setups.

## From a checkout

```sh
git clone https://github.com/asqueel-org/asqueel-js.git
cd asqueel-js
npm ci
npm test            # Node.js suite
npm run test:bun    # same suite on Bun
npm run browser     # local playground on http://127.0.0.1:8092
```
