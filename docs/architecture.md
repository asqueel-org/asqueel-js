# Architettura

Un solo package ESM con entry point distinti per runtime. Evitiamo per ora un
monorepo di package interdipendenti: i confini sono nei moduli e nei contratti.

## Percorso dei dati

1. `SqlBuilder` carica `src/generated/grammar.json` tramite Builders JS.
2. `composition.js` compone dichiarazioni e contributi conservando il sorgente esplicito;
   `application.js` risolve poi package, opzioni, tipi, riferimenti e nomi fisici;
   `model-relations.js` costruisce relazioni semantiche, inverse, virtuali e target degli alias.
3. `index.js` / `structures.js` producono `structure-1.0` per le migrazioni;
   `queries.js` compila richieste con i nomi logici dello stesso modello.
4. `sqlite.js` legge il catalogo reale e pianifica/applica le differenze supportate.
5. Un adapter esegue il SQL sul motore SQLite del runtime.

La risoluzione dei nomi è condivisa fra query e migrate. Il modello originale
non viene mutato. La grammatica descrive le dichiarazioni: non sostituisce gli
algoritmi che ne implementano gli effetti.

## Contratto adapter attuale

```js
await adapter.query(sql, params);   // array di record con nomi delle colonne
await adapter.execute(sql, params); // nessun risultato pubblico
await adapter.close();
```

`params` è un array per placeholder posizionali oppure un oggetto con i nomi
prefissati, per esempio `{':id': 1}`. Il compilatore restituisce nomi canonici
senza prefisso; il confine di esecuzione li adatta e converte i booleani in 0/1.
I risultati sono righe SQLite semplici, senza codec applicativi completi.

Gli adapter attivano le foreign key. Non decidono migrazioni, policy del modello
o hook. Node e Bun espongono lo stesso contratto ma usano driver sincroni.
L'adapter browser usa wa-sqlite Asyncify e IDBBatchAtomicVFS in un Web Worker.
Il WASM deve essere servito accanto al bundle che contiene l'adapter.

## Transazioni e concorrenza

Oggi `SqliteQueries.execute()` apre e chiude una transazione per INSERT;
`migrateSQLite()` gestisce una transazione per la migrazione. Il chiamante deve
serializzare le operazioni intere, non soltanto i singoli statement. Nel
playground una coda nel worker e Web Locks fanno questo lavoro.

Il prossimo incremento deve introdurre un'unità di lavoro esplicita e una
facciata worker riusabile, prima di aggiungere hook o scritture multiple. Non
aggiungere transazioni annidate con BEGIN dentro BEGIN.

## Codice di prodotto e playground

`src/` è la libreria. `browser/` è uno strumento di sviluppo: editor di codice,
RPC, dati demo e riferimenti Python non definiscono l'API di un'applicazione.
Le verifiche browser sono eseguite tramite il worker vero su database temporanei
distinti e confrontano l'esito con fixture Python. L'entry point principale non
importa driver Node/Bun, API DOM o il modulo WASM.

## Compatibilità

Il modello serializzato attraversa il worker come dati; il worker ricompila la
richiesta. Le espressioni SQL sono codice dell'applicazione, i valori dell'utente
passano nei parametri. Le dichiarazioni supportate dalla grammatica ma non dal
runtime vengono rifiutate esplicitamente.

La cache offline degli asset, i codec, i trigger applicativi e la sincronizzazione
non sono ancora implementati. Sono responsabilità distinte, da aggiungere con
contratti e verifiche dedicati.
