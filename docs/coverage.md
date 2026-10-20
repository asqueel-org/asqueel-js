# Copertura attuale

Questa tabella descrive codice esistente, non obiettivi futuri. La quantità di
righe non cambia la semantica richiesta; consente però di rimandare ottimizzazioni
e funzionalità avanzate fino a quando un'app ne abbia bisogno.

| Area | Già disponibile | Da completare |
| --- | --- | --- |
| Modello | Grammatica JSON, Bag/Builders JS, package, nomi logici/fisici, espansione opzioni nel JSON migrate | Runtime completo delle opzioni |
| Schema SQLite | Creazione tabelle, PK/UNIQUE/FK, colonne nullable e indici non univoci aggiunti | Ricostruzioni, alter/drop, CHECK e altri oggetti |
| Scritture | INSERT parametrizzato e RETURNING, rollback | UPDATE/DELETE, unità di lavoro, trigger e default applicativi |
| Letture | Campi, espressioni con alias, filtri, relazioni dirette, IN, ordine, paginazione | Colonne virtuali, GROUP BY/HAVING/DISTINCT, sottoquery e macro |
| Browser | SQLite WASM in worker, IndexedDB, riapertura connessione, coda e Web Locks nel playground | API worker pubblica e prove di crash/quota/concorrenza |
| Offline | Dati locali persistiti | Riapertura dell'app senza rete, cache e aggiornamenti degli asset |
| Node/Bun | Adapter esportati e stessi test SQLite | API applicativa stabile e codec |
| Parità | Modelli, cataloghi, SQL, parametri e risultati su casi espliciti | Inventario esaustivo e comportamenti applicativi |

Le opportunità più immediate sono UPDATE/DELETE sulle tabelle semplici, lookup
per chiave primaria e transazioni di più operazioni: possono riusare nomi,
parametri, espressioni e adapter già presenti. Richiedono comunque di distinguere
compilazione SQL da lifecycle applicativo delle scritture Python.

`sys_fields` va affrontato come comportamento, non soltanto come colonne create
dal migratore. Il runtime JS attualmente blocca tutte le opzioni applicative
attive nelle query; il riferimento Python può evolvere separatamente.

Il VFS IndexedDB è quello distribuito come esempio da wa-sqlite 1.0.0. I test
verificano l'esecuzione normale e il rollback, non certificano la conservazione
dei dati sotto ogni crash o politica di eliminazione dello storage del browser.
