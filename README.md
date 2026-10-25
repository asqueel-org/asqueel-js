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

Il [modello](docs/model.md) è allineato ad **Asqueel Python 0.7.0 al commit
f5185ad** (main dopo la 0.7.0, con il salvataggio della ricetta in TYTX):
contributi, package, opzioni, gruppi, colonne fisiche e virtuali, alias e relazioni.
`recipe.resolve()` restituisce il modello gerarchico; `model.queries(adapter)` lo usa
direttamente, anche per transazioni e hook. `recipe.toTytx()` salva il source della
ricetta come `recipe.source.to_tytx()` di Python; `SqlBuilder.fromTytx(text)` lo
ricarica attraverso la grammatica. Un file scritto da Python si carica in JS e
viceversa. Il confronto con Python riguarda il source composto in TYTX e il JSON
migrate, anche nel playground.

Le dichiarazioni ritirate in Python 0.6.1 (`subtable`, opzioni `partition` e `tenant`)
sono ritirate anche qui. Il compilatore SQLite copre CRUD, formule/alias semplici,
relazioni dirette anche composte, aggregazioni e policy dichiarative: **352 casi**
confrontano SQL, parametri e risultati con lo stesso Python 0.7.0.
Le letture includono formule annidate con parametri locali `var_*`/`var_kwargs`,
`#THIS`, `#ENV` da snapshot e proiezione/filtro delle colonne composte.
`#TEMPLATE` compone testi con valori NULL trattati come stringhe vuote;
`#IN_RANGE` gestisce intervalli inclusivi con estremi facoltativi. **46 casi** dedicati
verificano SQL e risultati, anche nel browser.
`#PERIOD` interpreta date naturali attraverso `parseDateExpression` di Gramlot,
fornito al runtime: **131 casi** e 27 rifiuti confrontati con Python.
[Configurazione ed esempi](docs/parity.md#period-e-parser-delle-date-naturali).
Sottoquery scalari, `EXISTS`, `subQueryColumn` e aggregazioni `aggr()` sulle relazioni
inverse/virtuali producono SQL correlato: conteggi, sum/avg/min/max, concatenazioni
ordinate e JSON, senza moltiplicare i record principali. Il corpus include anche
17 configurazioni rifiutate come in Python.
Le callback sincrone `sql_formula_*`, `subquery_*`, `env_*` e `formulaColumn_*`
sono registrate in `queries(adapter, {methods})`: **33 casi** confrontano
anche l'ordine delle chiamate, con 23 errori attesi e cache per ambiente.
[Esempi e contratto](docs/parity.md#callback-dinamiche-del-compilatore).
`sysFields` e hook di campo/tabella eseguono il ciclo applicativo, con **26 casi**
aggiuntivi che confrontano record, eventi, SQL e rollback con Python anche nel browser.
Gerarchie, `counter` e `relidx` aggiungono **39 scenari**: percorsi,
spostamenti e cancellazione di sottoalberi, radici collegate, contatori per gruppo,
rollback e riapertura IndexedDB. [Esempi e limiti](docs/playground.md#gerarchie-e-contatori-automatici).
Le cascade applicative `onUpdate` su relazioni fisiche sono eseguite con hook e
rollback atomico: **27 ulteriori scenari** confrontati con Python e nel browser.
Codec completi, altre opzioni applicative e query avanzate restano da portare.

## API iniziale

È disponibile anche `table.sql_insert(file, {format})` per importare **CSV, JSON e
TYTX**, con adattamento secondo il modello e rollback atomico, senza trigger come
in Python. **49 scenari** confrontano SQL e dati anche nel browser; il playground
permette di scegliere un file locale. [API, esempi e limiti](docs/import.md).

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
`model.queries(adapter)` serializza le proprie operazioni e offre `transaction(async tx => …)`
per più scritture atomiche. L'accesso diretto all'adapter, incluse le migrazioni,
va coordinato dal chiamante; l'API worker riusabile è ancora in roadmap.
Gli adapter Node/Bun usano driver sincroni dietro
un contratto asincrono, quindi non spostano il lavoro su un thread separato.

## Verifiche

```sh
npm run check                  # test Node + bundle browser
npm run test:bun               # stessi contratti sul driver Bun
npx playwright install chromium
npm run test:browser           # SQLite WASM + IndexedDB reali
```

La CI esegue Node 22/24, Bun e Chromium. I test browser verificano il source
composto, migrazioni, transazioni, rollback, vincoli, persistenza e i 352 casi query
confrontati con il riferimento Python fissato.
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

## Trasferimento offline

[Bag sorgente e snapshot TYTX](docs/transfers.md): Python → SQLite nel browser →
Python, con selezione di package/tabelle, conservazione di struttura e valori e
verifica reale su IndexedDB. La sincronizzazione resta al layer applicativo.


Per provare il trasferimento offline anche senza server e senza un primo accesso online:
`npm run build:file` produce **`output/asqueel-offline.html`**, esportato da Gramlot e
apribile direttamente con `file://` in Chromium. Include SQLite WASM e conserva modello
e dati nel profilo browser. Dettagli e verifiche in [Trasferimenti](docs/transfers.md).

English illustrated overview: [Serverless data applications — Gramlot & Asqueel-JS](docs/serverless-offline.html), including the verified offline workflows and tablet deployment considerations.

Scenario in italiano: [L’assemblea condominiale offline](docs/assemblea-condominiale-offline.html), dalla preparazione dei dati in Python al ritorno di votazioni e verbale nel gestionale.

PoC eseguibile: **`npm run build:assembly`**, poi aprire `output/assemblea-offline.html`. Schede per costituzione, ordine del giorno, lavori e verbale; stack per ogni punto e drawer dei partecipanti. Appello di 24 partecipanti, deleghe, ordine del giorno modificabile, cinque allegati di fantasia, interventi con autore e orario, pulsante amministratore e inserimento nel verbale, voti e verbale con barra strumenti fissa, tema Mimi scuro e salvataggio SQLite, con confronto Python e riavvio offline verificato in Chromium. [Istruzioni e limiti](docs/assembly.md).
