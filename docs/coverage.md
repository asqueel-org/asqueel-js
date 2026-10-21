# Copertura attuale

| Area | Disponibile | Passo successivo |
| --- | --- | --- |
| Modello portabile 0.6.1 | Grammatica JSON, contributi, package/configurazione, opzioni complete, gerarchia, relazioni, alias, codec e confronto integrale | Equivalenti JS per classi/callback e caricamento di package Python |
| Composizione | Contributi ordinati, ripetizioni, override, reset, copie, modelli indipendenti e colgroups | Estensioni applicative oltre il contratto JSON |
| Schema SQLite | Creazione tabelle, PK/UNIQUE/FK, aggiunta di colonne nullable e indici non univoci | Ricostruzioni, alter/drop, CHECK e altri oggetti |
| Scritture | INSERT parametrizzato e RETURNING, rollback | Porting query 0.6.1, UPDATE/DELETE, transazioni e trigger |
| Letture | Campi, espressioni, filtri, relazioni dirette, IN, ordine e paginazione del PoC precedente | Compilatore 0.6.1, virtuali, aggregazioni e sottoquery |
| Browser | SQLite WASM in worker, IndexedDB, riapertura, coda e Web Locks nel playground | API worker pubblica e prove crash/quota/concorrenza |
| Offline | Dati locali persistiti | Cache degli asset e riapertura dell'app senza rete |
| Node/Bun | Adapter e stessa suite di contratti | API applicativa stabile e codec delle righe |
| Parità | JSON completo del modello e migrate 0.6.1, cataloghi SQLite reali | SQL e ciclo applicativo delle query 0.6.1 |

Il [modello dichiarativo](model.md) è distinto dall'esecuzione delle sue opzioni:
`sys_fields` genera già colonne, virtuali, metadati e dichiarazioni di trigger,
ma non assegna ancora identificatori o timestamp nelle scritture JS.
Il runtime query esistente continua a rifiutare le opzioni applicative attive.

`subtable`, le opzioni `partition`/`tenant` e i vecchi attributi non ammessi sono
ritirati come nel riferimento. `virtualRelation` viene conservata nel modello;
non viene eseguita come JOIN dal compilatore attuale.

Il VFS IndexedDB è IDBBatchAtomicVFS di wa-sqlite 1.0.0. Le verifiche coprono
esecuzione normale, vincoli, rollback e riapertura; cache offline degli asset e
conservazione sotto crash o eliminazione dello storage restano lavori distinti.
