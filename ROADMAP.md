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

## 1. CRUD per piccole applicazioni — prossimo incremento

- [ ] UPDATE e DELETE con parametri, RETURNING e selezione per chiave primaria.
- [ ] Lettura di un singolo record, count ed exists con semantica definita.
- [ ] API transazione per più scritture atomiche; niente commit impliciti interni
      che impediscano un'unità di lavoro esterna.
- [ ] Errori identificabili per record assente, vincolo e funzionalità non supportata.
- [ ] API worker utilizzabile da un'app senza dipendere dal playground.

Accettazione: creare, leggere, modificare ed eliminare record e relazioni;
confrontare SQL, parametri e risultati con Python; provocare un errore a metà
di una transazione e verificare che nessuna scrittura resti; rileggere dopo reload.

## 2. Avvio e utilizzo offline

- [ ] Cache versionata di HTML, JavaScript, worker e WASM con service worker.
- [ ] Primo avvio online, chiusura, riapertura senza rete e CRUD completo.
- [ ] Coordinare aggiornamento degli asset e versione dello schema locale.
- [ ] Esportazione/importazione dei dati e gestione esplicita degli errori di quota.
- [ ] Verificare più schede aperte e richieste concorrenti attraverso l'API worker.
- [ ] Verificare Chromium, Firefox e WebKit; dichiarare solo i browser verificati.

Accettazione: test automatico con rete disabilitata dopo l'installazione;
persistenza dopo chiusura e riapertura del browser con lo stesso profilo;
aggiornamento di versione senza perdita dei dati. La persistenza IndexedDB da
sola non soddisfa questo traguardo.

## 3. Comportamenti applicativi utili

- [ ] Codec con semantica dichiarata per date, timestamp, decimali e JSON/Bag.
- [ ] Default e validazioni basilari, rispettando campi mancanti e NULL.
- [ ] `sys_fields`: identificatori, timestamp e utente, con fonti iniettabili nei test.
- [ ] Hook before/after e rollback coerente delle scritture.
- [ ] Colonne formula e alias semplici, poi aggregazioni GROUP BY/HAVING/DISTINCT.

Accettazione: stessa sequenza di eventi e stessi effetti del riferimento Python
scelto; orologio, identità e generatore ID controllabili. Controllare il Python
attuale prima di assumere ancora validi i limiti riportati dal PoC.

## 4. Evoluzione del modello

- [ ] Pianificare ricostruzioni di tabelle SQLite con copia e verifica dei dati.
- [ ] Supportare modifiche di default, tipi, vincoli e indici con precondizioni chiare.
- [ ] Rendere le migrazioni fallite recuperabili, senza modifiche parziali.
- [ ] Documentare versioni di formato e compatibilità degli aggiornamenti.

Accettazione: confronti dei cataloghi con Python, prove con dati reali, rollback
simulato durante la copia e migrazione idempotente dopo riapertura.

## 5. Estensione verso la copertura completa

- [ ] Inventario di ogni capacità Python con stato JS: supportata, da portare,
      non applicabile a SQLite o dipendente da servizi esterni.
- [ ] Relazioni inverse, sottoquery, macro e colonne virtuali avanzate.
- [ ] Gerarchie, contatori, partizioni, audit e altre opzioni, una alla volta.
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
