# Browser and offline use

## SQLite in a Web Worker

```js
// worker.js, bundled with the application
import {defineModel} from '@asqueel/asqueel-js';
import {migrateSQLite} from '@asqueel/asqueel-js/sqlite';
import {openBrowserSQLite} from '@asqueel/asqueel-js/adapters/browser';

const adapter = await openBrowserSQLite('my-app-db');
await migrateSQLite(adapter, model.toMigration());
const db = model.queries(adapter);
```

- The adapter uses wa-sqlite 1.0.0, Asyncify build, with `IDBBatchAtomicVFS` and
  `strict` durability. It needs IndexedDB and Web Locks in a secure context
  (HTTPS or `localhost`).
- `openBrowserSQLite(name)` loads `wa-sqlite/dist/wa-sqlite-async.wasm` from the
  bundle location: serve that file next to the bundle.
- `openBrowserSQLite(name, {wasmBinary})` takes the WASM bytes as a `Uint8Array` and
  fetches nothing. A page opened from `file://` uses this form.
- The database is stored in IndexedDB under `name`. A different origin (host or port)
  is a different storage. Clearing the site data deletes the database.
- The package ships ES modules, not a prebuilt worker. The application bundles its own
  worker and keeps the main thread free of SQLite.

The VFS shipped by wa-sqlite is an example implementation. Robustness against browser
crashes and storage quota exhaustion is not certified. Queues and Web Locks serialize
the work of the playground; a public worker API is on the roadmap.

## The playground

```sh
npm ci
npm run browser     # http://127.0.0.1:8092
```

The playground is a [Gramlot](https://github.com/gramlot-org/gramlot) application served
locally. It runs the code of its editor: it is a development tool, not a sandbox for
untrusted code. Its pages:

- **Models:** an editor for a JavaScript model, its migration JSON next to the Python
  reference, the composed source in TYTX and the composition checks.
- **SQLite migrations:** SQL plan, apply, sample data, catalog, reopen and SQLite checks.
- **Queries:** a JSON request, its SQL and parameters, execution and comparison with
  the Python fixtures; buttons for the write-cycle, hierarchy, cascade and import checks.
- **Offline transfer:** load a Python snapshot, work offline, export it back.

The draft model is shared by the pages and kept across reloads in `localStorage`.
The application database is `asqueel-js-playground-v1`. The checks run on separate
temporary databases and compare with saved Python fixtures; Python never runs in the browser.

## Offline cycle in the playground

1. Open `/?page=transfer` online and wait for **App ready to reopen without network**.
   The service worker caches HTML, modules, Gramlot themes, workers and the SQLite WASM.
2. Download the Python sample, select it and load it into local SQLite. IndexedDB keeps
   the database and the source.
3. Disconnect the network. The JSON editor runs `select`, `insert`, `update` and `delete`
   through the model compiler. These are direct queries: they do not run the hooks of
   `table.insert/update/delete`.
4. Close and reopen the app, also after restarting the browser: the model is rebuilt from
   the saved source and the data is read back. Export the snapshot for Python, also offline.

Assets are cached per version and installed completely before activation. Updates wait
until the tabs of the old version close; no migration of the user database runs when
assets change. Quota handling, storage eviction and migrations between application
versions still need dedicated work.

## A single HTML file opened with `file://`

```sh
npm run build:file      # output/asqueel-offline.html
npm run test:file
```

`build:file` uses the `@gramlot/gramlot-serverless` exporter: the Gramlot runtime, the
page and its logic, CSS, the SQLite worker and the WASM are embedded in one HTML file.
It needs no server, no service worker and no first online start. The page offers the
Python samples, snapshot loading, a JSON query editor, reload and export.

SQLite and the source live in IndexedDB in the browser profile, not in the file. Reopen
the same path with the same profile; different paths have separate workspaces. To move
the work, export and import the snapshot.

The Chromium test copies only the HTML into a temporary folder, starts offline, loads
Python data, runs CRUD from the page controls, kills the browser and restarts it with the
same profile, still offline. It checks zero HTTP requests and the isolation between paths;
the exported file is then verified by the Python receiver.

Safari desktop 27.0.1 was verified through its automation: loading, CRUD, closing and
reopening the tab, recovery from IndexedDB and a return accepted by Python. That test
reopens the tab in the same automated session; it does not verify a full process restart
or a physically disconnected network. Bag and blob fields on Safari, Firefox and tablets
are not qualified yet.

## Pages for evaluators

- <a href="../serverless-offline.html">Serverless data applications</a>: the verified offline
  workflows and tablet deployment considerations.
- <a href="../offline-condominium-meeting.html">The offline condominium meeting</a>: a scenario
  from data preparation in Python to the return of votes and minutes.
- {doc}`assembly-demo`: the runnable meeting application.
