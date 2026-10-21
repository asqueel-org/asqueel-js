# Asqueel JS

Modelli dichiarativi e SQLite per applicazioni JavaScript che devono funzionare
offline, con piccole tabelle locali. Browser prima; Node.js e Bun condividono
modello, compilazione SQL e migrazioni.

**Stato: sviluppo iniziale.** La base deriva dal PoC di Asqueel, con confronti
indipendenti contro Python. La prima release npm 0.1.0 espone le capacità già verificate; non è un porting completo.
La persistenza nel browser funziona; il caricamento dell'app senza rete non è
ancora implementato. Vedi [copertura](docs/coverage.md) e [roadmap](ROADMAP.md).

## Installazione

```sh
npm install @asqueel/asqueel-js
```

Il pacchetto include sorgenti ESM, adapter e grammatica; non richiede Python.
Le API sono ancora in evoluzione. Il playground si avvia dal checkout del repository.

## Avvio dal checkout

Servono Node.js >=22.13 e npm. Bun è opzionale per la seconda suite nativa.

```sh
npm ci
npm test
npm run browser
```

Il playground Gramlot apre un server su <http://127.0.0.1:8092>, con pagine
**Modello**, **Migrazioni SQLite** e **Query**. La bozza del modello è condivisa
tra le pagine e conservata al reload. JavaScript, worker e WASM
sono serviti localmente; non serve Python. Usa un database IndexedDB dedicato
`asqueel-js-playground-v1`. [Guida agli esempi](docs/playground.md).

Il [modello risolto](docs/model.md) è allineato ad **Asqueel Python 0.6.1**:
contributi, package, opzioni, gruppi, colonne fisiche e virtuali, alias e relazioni.
`recipe.resolve()` restituisce il modello gerarchico; `toJSON()` ne esporta tutti
i nodi e attributi, e `DbModel.fromJSON()` lo ripristina. JSON completo e JSON migrate
sono confrontati indipendentemente con Python, anche nel playground.

Le dichiarazioni ritirate in Python 0.6.1 (`subtable`, opzioni `partition` e `tenant`)
sono ritirate anche qui. Le query e l'esecuzione dei comportamenti applicativi
sono il prossimo incremento: le fixture SQL esistenti restano regressioni del
precedente compilatore, non una dichiarazione di parità query con la 0.6.1.

## API iniziale

Gli import seguenti usano gli entry point del package installato:

```js
import {defineModel} from '@asqueel/asqueel-js';
import {migrateSQLite} from '@asqueel/asqueel-js/sqlite';
import {openNodeSQLite} from '@asqueel/asqueel-js/adapters/node';

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

Su Bun usare `openBunSQLite` da `@asqueel/asqueel-js/adapters/bun`. Nel browser usare
`openBrowserSQLite` da `@asqueel/asqueel-js/adapters/browser` in un worker: occorre
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

La CI esegue Node 22/24, Bun e Chromium. I test browser verificano il modello
completo, migrazioni, rollback, vincoli, persistenza e le 18 regressioni query
confrontate con i risultati del precedente riferimento Python.
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
