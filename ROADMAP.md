# Percorso verso Asqueel JS completo

L'obiettivo iniziale è una piccola applicazione locale realmente utilizzabile
senza rete. La copertura completa delle funzionalità Asqueel applicabili a
SQLite si costruisce per incrementi verificabili. Questa roadmap non dichiara
supportate funzionalità soltanto perché presenti nella grammatica.

## 0. Base autonoma

- [x] Importare il PoC mantenendo grammatica e oracoli indipendenti Python.
- [x] Separare gli entry point degli adapter browser, Node e Bun.
- [x] Rendere riproducibile l'installazione con lockfile.
- [x] Automatizzare i controlli SQLite reali in Chromium, oltre a Node/Bun.
- [x] Documentare contratto adapter, limiti e metodo di verifica Python.
- [x] Configurare CI per Node 22/24, Bun, Chromium e parità Python su revisioni fissate.
      Gli esiti di ogni revisione sono consultabili nei workflow GitHub.

## 1. Modello dichiarativo portabile · riferimento Python 0.7.0 · f5185ad

- [x] Riallineare grammatica, esempi e verificatore al commit Python f5185ad.
- [x] Nomi legacy delle opzioni, `relation(related_column)`, solo package, nessun `x_*`.
- [x] Source della ricetta in TYTX (`SqlSourceBag`), caricabile da Python e da JS.
- [x] Contributi ordinati, conflitti, copie, reset e composizione indipendente.
- [x] Modello gerarchico JS, colonne fisiche/virtuali e metadati completi delle opzioni.
- [x] Colgroups, relazioni dirette/inverse, alias e dichiarazioni virtualRelation.
- [x] Validazione strutturale, tipi, riferimenti, indici e nomi fisici.
- [x] Confronti di source composto e migrate con Python, Node, Bun e browser.
- [x] Gerarchie collegate al master e nomi personalizzati dei contatori della 0.6.1.
- [x] Ritirare `subtable`, opzioni `partition`/`tenant` e vecchi attributi come in Python.

Il contratto e i limiti portabili sono in [model.md](docs/model.md). Classi Python,
caricamento di package Python e callback richiedono equivalenti JS. L'esecuzione
delle dichiarazioni sulle righe appartiene alla fase successiva.

## 2. CRUD per piccole applicazioni

- [x] UPDATE e DELETE con parametri, RETURNING automatico e selezione per chiave primaria.
- [x] Lettura di un singolo record, count ed exists con semantica definita.
- [x] API transazione per più scritture atomiche; niente commit impliciti interni
      che impediscano un'unità di lavoro esterna.
- [ ] Errori identificabili per record assente, vincolo e funzionalità non supportata.
- [ ] API worker utilizzabile da un'app senza dipendere dal playground.

Accettazione: creare, leggere, modificare ed eliminare record e relazioni;
confrontare SQL, parametri e risultati con Python; provocare un errore a metà
di una transazione e verificare che nessuna scrittura resti; rileggere dopo reload.

## 3. Avvio e utilizzo offline

- [x] Cache versionata di HTML, JavaScript, temi, worker e WASM con service worker nel playground.
- [x] Primo avvio online, CRUD, chiusura e riavvio di Chromium senza rete con lo stesso profilo;
  ripristino del modello/dati e ritorno dello snapshot reale a Python.
- [x] HTML unico esportato da Gramlot, aperto da `file://` senza primo avvio online:
  SQLite WASM incorporato, CRUD, riavvio Chromium e ritorno verificato in Python.
- [ ] Coordinare aggiornamento degli asset e versione dello schema locale.
- [x] Importazione CSV/JSON/TYTX tramite sql_insert, con parità Python e verifiche browser.
- [x] Snapshot Python → browser → Python: SourceBag anche parziale e dati TYTX,
  con confronto modello/migrate/catalogo/valori e ritorno reale del browser a Python.
- [ ] Gestione esplicita degli errori di quota durante import/export e persistenza.
- [ ] Verificare più schede aperte e richieste concorrenti attraverso l'API worker.
- [ ] Verificare Chromium, Firefox e WebKit; dichiarare solo i browser verificati.

Accettazione: test automatico con rete disabilitata dopo l'installazione;
persistenza dopo chiusura e riapertura del browser con lo stesso profilo;
aggiornamento di versione senza perdita dei dati. La persistenza IndexedDB da
sola non soddisfa questo traguardo.

## 4. Comportamenti applicativi utili

- [ ] Codec con semantica dichiarata per date, timestamp, decimali e JSON/Bag.
- [x] Default e protezioni basilari, rispettando campi mancanti e NULL.
- [x] `sysFields`: identificatori, timestamp e utente, con fonti iniettabili nei test.
- [x] Hook before/after e rollback coerente delle scritture, anche annidate.
- [x] Gerarchie: percorsi, spostamenti, ereditarietà, radici collegate e cancellazione dei discendenti.
- [x] `counter` per gruppo e `relidx`, con rollback e verifica IndexedDB.
- [x] Cascade applicative `onUpdate` su colonne fisiche, hook annidati, raise/ignore e rollback.
- [x] Colonne formula e alias semplici, aggregazioni GROUP BY/HAVING/DISTINCT.
- [x] Letture calcolate: parametri locali delle formule, #THIS, #ENV da snapshot,
      colonne composte e pkey composta aggiunta alla SELECT; confronto Python e browser.

Accettazione: stessa sequenza di eventi e stessi effetti del riferimento Python
scelto; orologio, identità e generatore ID controllabili. Controllare il Python
attuale prima di assumere ancora validi i limiti riportati dal PoC.

## 5. Evoluzione dello schema SQLite

- [ ] Pianificare ricostruzioni di tabelle SQLite con copia e verifica dei dati.
- [ ] Supportare modifiche di default, tipi, vincoli e indici con precondizioni chiare.
- [ ] Rendere le migrazioni fallite recuperabili, senza modifiche parziali.
- [ ] Documentare versioni di formato e compatibilità degli aggiornamenti.

Accettazione: confronti dei cataloghi con Python, prove con dati reali, rollback
simulato durante la copia e migrazione idempotente dopo riapertura.

## 6. Estensione verso la copertura completa

- [ ] Inventario di ogni capacità Python con stato JS: supportata, da portare,
      non applicabile a SQLite o dipendente da servizi esterni.
- [x] Sottoquery scalari/EXISTS/subQueryColumn e aggregazioni su relazioni inverse
      e virtuali, con binding locali, JSON e concatenazioni ordinate.
- [x] Callback formula/env/subquery e colonne virtuali dinamiche, cache per ambiente,
      SQL/risultati/chiamate confrontati con Python anche nel browser.
- [x] #TEMPLATE e #IN_RANGE, con SQL/parametri/risultati identici a Python anche su WASM.
- [x] #PERIOD tramite parser Gramlot, con date civili, ambiente esplicito e parità Python/browser.
- [ ] #BAG/#BAGCOLS e metadati dei risultati.
- [ ] Partizioni, audit e altre opzioni; azioni applicative su relazioni composte.
- [ ] API pubblica stabilizzata, dichiarazioni TypeScript e pacchetto distribuibile.
- [ ] Documentazione applicativa, compatibilità e criteri della prima release.

Sincronizzazione con server e risoluzione dei conflitti richiedono un contratto
dedicato. Non sono implicite nel funzionamento offline e non bloccano il primo
traguardo locale. I dialetti di database server restano una successiva decisione
di prodotto; il target iniziale dei tre runtime è SQLite.

## Regola per ogni incremento

Modello → compilazione → esecuzione → riapertura: verificare tutto il percorso
interessato. Confrontare con Python quanto deterministico; per ID, clock e hook
verificare formato, ordine ed effetti con dipendenze controllate. Una capacità
non implementata deve produrre un errore esplicito, non una degradazione silenziosa.
