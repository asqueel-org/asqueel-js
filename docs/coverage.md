# Copertura attuale

| Area | Disponibile | Passo successivo |
| --- | --- | --- |
| Modello portabile 0.6.1 | Grammatica JSON, contributi, package/configurazione, opzioni complete, gerarchia, relazioni, alias, codec e confronto integrale | Equivalenti JS per classi/callback e caricamento di package Python |
| Composizione | Contributi ordinati, ripetizioni, override, reset, copie, modelli indipendenti e colgroups | Estensioni applicative oltre il contratto JSON |
| Schema SQLite | Creazione tabelle, PK/UNIQUE/FK, aggiunta di colonne nullable e indici non univoci | Ricostruzioni, alter/drop, CHECK e altri oggetti |
| Scritture | INSERT/UPDATE/DELETE per chiave anche composta, default/sql_value/RETURNING automatico, transazioni e rollback | Bulk/selection writes e codec completi |
| Ciclo applicativo | sys_fields, ID legacy22, timestamp/utente, default, protezioni di campo, hook before/after e scritture annidate atomiche, gerarchie, auto_counter, relative_index, cancellazione/archiviazione dei discendenti, onUpdate cascade/raise/ignore | Altre opzioni, azioni su relazioni composte, ambiente mutabile e servizi esterni |
| Letture | Campi/formule/alias semplici, relazioni dirette anche composte, IN, ordine/paginazione, GROUP BY/HAVING/DISTINCT, count/exists/fetchRecord | Relazioni inverse/virtualRelation, macro, sottoquery e metadati dei risultati |
| Policy di riga | Draft/logical deletion in lettura, partizioni con snapshot esplicito in lettura/scrittura | Ambiente applicativo contestuale completo |
| Browser | SQLite WASM in worker, IndexedDB, riapertura, coda e Web Locks nel playground | API worker pubblica e prove crash/quota/concorrenza |
| Offline | Dati locali persistiti | Cache degli asset e riapertura dell'app senza rete |
| Node/Bun | Adapter e stessa suite di contratti | API applicativa stabile e codec delle righe |
| Parità | JSON completo/migrate 0.6.1 + fix #44, cataloghi SQLite, 60 casi query e 26 cicli sys_fields/hook e 39 gerarchie/contatori e 27 onUpdate reali | Restanti capacità del compilatore e ciclo applicativo |

Il [modello dichiarativo](model.md) è distinto dall'esecuzione delle sue opzioni:
`sys_fields` genera colonne e metadati e viene eseguito da `table.insert/update/delete`:
ID, timestamp e utenti seguono il riferimento. Gli hook sono funzioni JS registrate
separatamente dal modello JSON. `hierarchical`, `auto_counter` e `relative_index` sono eseguite dallo stesso ciclo,
comprese radici collegate e cancellazione/archiviazione dei discendenti. Le altre
opzioni attive restano rifiutate esplicitamente. Le azioni applicative `onUpdate`
(`cascade`, `raise`, `ignore`) sono eseguite per relazioni su colonne fisiche;
le azioni su relazioni composte non sono ancora portate. Le letture applicano le policy dichiarative
senza eseguire hook. `compile/execute` restano il livello SQL del PoC e rifiutano
modelli che richiedono il ciclo applicativo: usare i metodi della tabella.
Le colonne generate sono verificate su schemi creati dal migratore Python:
il renderer JS produce il JSON corretto, ma il migratore SQLite JS le rifiuta ancora.

`subtable`, le opzioni `partition`/`tenant` e i vecchi attributi non ammessi sono
ritirati come nel riferimento. `virtualRelation` viene conservata nel modello;
non viene eseguita come JOIN dal compilatore attuale.

Il VFS IndexedDB è IDBBatchAtomicVFS di wa-sqlite 1.0.0. Le verifiche coprono
esecuzione normale, vincoli, rollback e riapertura; cache offline degli asset e
conservazione sotto crash o eliminazione dello storage restano lavori distinti.
