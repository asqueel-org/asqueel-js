# Asqueel JS

Modelli dichiarativi e SQLite per applicazioni JavaScript che devono funzionare
offline, con piccole tabelle locali. Browser prima; Node.js e Bun condividono
modello, compilazione SQL e migrazioni.

**Stato: sviluppo iniziale.** La base deriva dal PoC di Asqueel, con confronti
indipendenti contro Python. Non è ancora un porting completo né una release npm.
La persistenza nel browser funziona; il caricamento dell'app senza rete non è
ancora implementato. Vedi [copertura](docs/coverage.md) e [roadmap](ROADMAP.md).

## Avvio

Servono Node.js >=22.13 e npm. Bun è opzionale per la seconda suite nativa.

```sh
npm ci
npm test
npm run browser
```

Il playground apre un server su <http://127.0.0.1:8092>. JavaScript, worker e WASM
sono serviti localmente; non serve Python. Usa un database IndexedDB dedicato
`asqueel-js-playground-v1`. [Guida agli esempi](docs/playground.md).

Il model supporta [contributi ordinati e composizione di modelli indipendenti](docs/composition.md)
con `model.contribution(...)`, `composeModels(...)` e `model.clone()`. Sorgente
composto e JSON migrate sono confrontati con Python prima di espandere la copertura.

## API iniziale

Dal checkout, gli import seguenti usano gli entry point del package:

```js
import {defineModel} from '@asqueel/js';
import {migrateSQLite} from '@asqueel/js/sqlite';
import {openNodeSQLite} from '@asqueel/js/adapters/node';

const model = defineModel(root => {
    const pkg = root.db({name: 'notes'}).packages()
        .package({name: 'app', sqlschema: 'main', sqlprefix: 'app'});
    const columns = pkg.tables().table({name: 'note', pkey: 'id'}).columns();
    columns.column({name: 'id', dtype: 'I'});
    columns.column({name: 'body', dtype: 'T'});
});
const adapter = openNodeSQLite(':memory:');
try {
    await migrateSQLite(adapter, model.toMigration());
    const notes = model.queries(adapter).table('app.note');
    await notes.insert({id: 1, body: 'Una nota locale'});
    console.log(await notes.query({columns: '*', order_by: '$id'}).fetch());
} finally {
    await adapter.close();
}
```

Su Bun usare `openBunSQLite` da `@asqueel/js/adapters/bun`. Nel browser usare
`openBrowserSQLite` da `@asqueel/js/adapters/browser` in un worker: occorre
bundlare l'entry point e servire il WASM accanto al bundle, come nel playground.
Il chiamante deve serializzare operazioni e transazioni intere; l'API worker
riusabile è ancora in roadmap. Gli adapter Node/Bun usano driver sincroni dietro
un contratto asincrono, quindi non spostano il lavoro su un thread separato.

## Verifiche

```sh
npm run check                  # test Node + bundle browser
npm run test:bun               # stessi contratti sul driver Bun
npx playwright install chromium
npm run test:browser           # SQLite WASM + IndexedDB reali
```

La CI esegue Node 22/24, Bun e Chromium. I test browser verificano migrazioni,
rollback, vincoli, persistenza e 18 query confrontate con risultati Python.
Il confronto con Python dal vivo è descritto in [parità](docs/parity.md).

## Organizzazione

- [`src/`](src/): modello, risoluzione applicativa, query e migrazioni.
- [`src/adapters/`](src/adapters/): confini specifici per runtime.
- [`src/generated/`](src/generated/): grammatica e contratto esportati da Python.
- [`test/`](test/): contratti nativi, oracoli Python e integrazione browser.
- [`browser/`](browser/): playground, worker e verifiche WASM.
- [`examples/`](examples/): modelli JavaScript e Python indipendenti.
- [`scripts/`](scripts/): build, server di sviluppo e confronto Python.

Le regole di sviluppo sono in [CONTRIBUTING.md](CONTRIBUTING.md), i confini dei
componenti in [architettura](docs/architecture.md). Licenza Apache-2.0.
