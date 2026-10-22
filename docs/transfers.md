# Snapshot Python → browser → Python

Il layer trasferisce **Bag sorgente e record**, senza implementare sincronizzazione,
conflitti, proprietà dei record o autorizzazioni. L’applicazione sceglie quali dati
inviare e come applicare quelli restituiti. Non serve eseguire Python nel browser.

## Python: preparare lo snapshot

Il modulo `python/asqueel_transfer.py` usa Asqueel, genro-builders, genro-bag e
TYTX già disponibili nell’applicazione Python. Il riferimento verificato è
Asqueel 0.6.4, come il resto del porting.

```python
from asqueel_transfer import export_transfer

bundle = export_transfer(
    builder,
    records={
        'work.document': document_records,
        'work.line': line_records,
    },
    tables=['work.document', 'work.line'],
)
# JSON dell'envelope attraverso il trasporto scelto dall'applicazione.
```

`records` contiene iterable di dizionari, con **tutte le colonne fisiche**,
chiavi primarie comprese; escludere formule/alias virtuali. È l’applicazione a
leggere il subset dal server. Date, datetime, time, Decimal e booleani Python
vengono codificati in TYTX. Ogni tabella contiene una stringa TYTX, un record
per riga. I testi con suffissi come `::D` sono protetti come testo (`::T`).

Omettere `tables` per l’intero modello; `packages=['work']` seleziona package.
Le selezioni possono essere combinate per intersezione. Le tabelle di cui si
trasferisce solo la struttura possono essere omesse da `records`.
Le relazioni verso tabelle escluse causano errore: includerne la struttura e,
per le foreign key, i record necessari. Non scarichiamo automaticamente dati
aggiuntivi e non rimuoviamo relazioni.

La sorgente è una **vera SourceBag serializzata in TYTX**, con tag, etichette,
attributi e metadati; non è il modello risolto e non è un elenco di chiamate.
Una copia separata converte implementation in `sqlite` e gli schemi dei package
in `main`, mantenendo nomi SQL e prefissi. Le collisioni tra nomi sono errori.
Il builder originale non viene modificato. Connessioni e `x_table_class` vengono
esclusi e segnalati in `omitted`; le funzioni Python non vengono trasferite.
Gli attributi della dichiarazione devono essere valori JSON portabili; resolver
e oggetti runtime non vengono trasportati. Gli hook necessari al lavoro offline devono essere forniti dall’applicazione JS.
Restano applicabili i limiti delle dichiarazioni SQL supportate dal porting.

## Browser, Node e Bun

```js
import {importTransfer, exportTransfer} from '@asqueel/asqueel-js/transfer';
import {openBrowserSQLite} from '@asqueel/asqueel-js/adapters/browser';

const sqlite = await openBrowserSQLite('my-offline-work');
const {builder, counts} = await importTransfer(sqlite, bundle);
const db = builder.queries(sqlite);
await db.table('work.document').update({id: 'd1', title: 'Modificato offline'});

const returned = await exportTransfer(sqlite, builder);
// L'applicazione conserva/invia returned quando decide di farlo.
```

`readTransfer(bundle)` valida e ricostruisce il builder senza I/O.
`importTransfer` applica la migrazione, quindi carica tutte le tabelle in una
transazione. Conserva i NULL espliciti, senza riapplicare default o trigger.
Le foreign key sono controllate a fine snapshot: l’ordine padre/figlio non è
vincolante. Errori e duplicati annullano **tutti i dati importati**. La migrazione
è una transazione precedente: dopo un errore sui dati la struttura resta.
Non è un upsert e non sostituisce record già presenti.

`exportTransfer` legge uno snapshot coerente delle tabelle scelte
(`{tables: ['work.document', 'work.line']}`, tutte per default), mantenendo la
Bag sorgente. Non filtra righe, non calcola delta né cancellazioni. Per una
riapertura dopo reload l’applicazione conserva anche `bundle.source`/l’envelope:
IndexedDB conserva il database, non il builder in memoria.

Tipi supportati: A, B, C, D, DH, DHZ, H, I, L, N, R, T, più **X (Bag)** e
**O (blob)**.
Le date conservano la rappresentazione civile, il fuso e i microsecondi.
La precisione dei numeri resta quella di SQLite: NUMERIC non è un archivio
Decimal arbitrariamente preciso. Gli interi oltre la precisione sicura JS
vengono rifiutati. Gli snapshot piccoli sono materializzati in memoria.

## Campi Bag e blob

I record Python contengono `Bag` per le colonne X e `bytes`, `bytearray` o
`memoryview` per le colonne O. Per un campo Bag letto come XML dal server,
convertirlo prima con `Bag.from_xml(xml)`. I blob viaggiano nel tipo TYTX
`RAW` (base64) e vengono salvati come **BLOB SQLite**, senza conversioni UTF-8.

Le Bag viaggiano nel normale formato TYTX `X`. Sono conservati ordine dei nodi,
etichette, tag, attributi, annidamento, valori tipizzati e byte contenuti nella
Bag. Sono supportati anche dizionari/liste JSON all’interno della Bag. I resolver
non sono snapshot di dati e vengono rifiutati. Bag vuota, blob vuoto e NULL
restano tre casi distinti.

Il database locale e il database Python di staging conservano la Bag come
**testo TYTX**, non come XML legacy. L’export restituisce il TYTX originale,
senza decodificarlo e ricodificarlo attraverso `Date` JavaScript: fuso,
microsecondi e precisione Decimal dei campi annidati restano intatti.
Per lavorare sulla Bag in JavaScript si può usare `Bag.fromTytx(testo)`;
quando la si riserializza dopo modifiche si applicano i limiti dei tipi JS
(per esempio `Date` ha precisione al millisecondo). Il trasferimento di una
Bag non modificata conserva invece la rappresentazione Python originale.

Al ritorno `genro_tytx.from_tytx(riga)` produce vere `Bag` e `bytes` Python.
La conversione verso XML legacy e la scrittura nel database applicativo restano
al chiamante: questo lavoro estende gli snapshot, non il compiler delle query
Bag o la sincronizzazione. Il ricevitore di staging conserva anche le Bag vuote,
mentre il normale writer Python può trattarle come NULL.

L’adapter browser copia i byte dalla memoria WASM prima del prossimo step
SQLite e gestisce esplicitamente il binding del blob vuoto, per evitare che
sia confuso con NULL.

## Ritorno Python e verifica

```python
from asqueel_transfer import read_transfer, load_transfer

portable_builder = read_transfer(returned)
# Destinazione separata di staging/verifica; non sincronizza il DB remoto.
load_transfer(returned, 'returned.sqlite')  # destinazione vuota
```

Il ricevitore Python richiede una destinazione SQLite vuota e non modifica un
database esistente con tabelle.

Il playground Gramlot ha la pagina **Trasferimento offline**: scarica l’esempio
Python, carica un envelope locale in un database IndexedDB separato ed esporta
lo snapshot per Python. Il pulsante di verifica confronta il riferimento
Python fissato nel repository, esegue modifiche reali e riapre IndexedDB.
Il browser non esegue un processo Python.

Per provare anche il ricevitore Python sui file realmente restituiti dal browser:

```sh
npm run test:browser
.reference/venv-current/bin/python scripts/verify_transfers.py \
  --browser output/browser-transfer-returns.json
```

La verifica confronta modello completo, JSON migrate, catalogo fisico e valori;
il ricevitore controlla anche i tipi TYTX decodificati. `scripts/verify_python.py`
include lo stesso giro con Node e Bun e verifica che le fixture corrispondano
al Python di riferimento non modificato.


### Ciclo completo senza rete nel playground

1. Aprire `/?page=transfer` online e attendere **App pronta per la riapertura senza rete**.
   Il service worker salva HTML, moduli, temi Gramlot, worker e SQLite WASM.
2. Scaricare l'esempio Python, selezionarlo e premere **Carica in SQLite locale**.
   In IndexedDB vengono conservati sia il database sia la Bag sorgente e il suo identificatore.
3. Disconnettere la rete. L'editor JSON esegue `select`, `insert`, `update` e `delete`
   sul workspace caricato tramite il compiler del modello. SQL, risultati, struttura e valori
   compaiono in **Struttura e valori**. Le scritture di questo editor sono query dirette:
   non invocano gli hook applicativi della API `table.insert/update/delete`.
4. Chiudere e riaprire l'app allo stesso indirizzo, anche riavviando il browser:
   il modello viene ricostruito dalla sorgente salvata; i dati vengono riletti, senza importare
   nuovamente quelli iniziali. Premere **Esporta snapshot per Python** anche senza rete.

Il test automatico esegue lettura, modifica, inserimento e cancellazione, termina Chromium
poi avvia un nuovo processo con lo stesso profilo e con rete già disabilitata.
Confronta modello, migrate, catalogo e valori con Python prima e dopo; esporta il file
reale dall'app riaperta. Un altro test ricarica offline Bag e blob senza perdere valori;
un import fallito lascia attivo il workspace precedente.

```sh
npm run test:browser
.reference/venv-current/bin/python scripts/transfer_oracle.py \
  --verify-return output/offline-transfer-returns.json
```

Questa ultima verifica importa davvero in Python il file prodotto durante il test offline.
La sincronizzazione sul database remoto resta al layer applicativo.

Gli asset hanno una cache per versione, installata integralmente prima dell'attivazione.
Gli aggiornamenti attendono la chiusura delle schede della vecchia versione; nessuna
migrazione automatica del database utente viene eseguita al cambio degli asset.
Il playground mantiene un solo workspace attivo; caricarne uno nuovo cambia il riferimento
soltanto dopo importazione e salvataggio riusciti. I precedenti database non vengono eliminati.
Verificato su Chromium: quota, cancellazione/evizione dello storage da parte del browser e
migrazioni tra versioni applicative richiedono ancora gestione dedicata.


### Un solo HTML, aperto con `file://`

```sh
npm run build:file
# Aprire output/asqueel-offline.html direttamente nel browser.
npm run test:file
.reference/venv-current/bin/python scripts/transfer_oracle.py \
  --verify-return output/file-transfer-returns.json
```

`build:file` usa l'esportatore ufficiale `@gramlot/gramlot-serverless`: runtime Gramlot,
Pagina/Logic, CSS, worker SQLite e WASM sono incorporati in un unico HTML. Non occorrono
file accanto all'HTML, un server, un service worker o un primo avvio online.
L'adapter accetta `openBrowserSQLite(name, {wasmBinary})`, con i byte WASM in una
`Uint8Array`; omettendo l'opzione mantiene il caricamento esterno usato dal sito.

La pagina offre download degli esempi Python, caricamento dello snapshot, editor JSON
per le query sul modello, rilettura ed esportazione. Come nell'editor del playground,
le scritture passano dal compiler e non invocano gli hook della API applicativa.
Il file HTML resta invariato: SQLite e la Bag sorgente sono in IndexedDB nel profilo
browser. Occorre riaprire lo stesso percorso con lo stesso profilo; percorsi diversi
hanno workspace separati. Per spostare il lavoro, esportare e reimportare lo snapshot.

Il test **Chromium** copia solo l'HTML in una cartella temporanea, parte già offline,
carica dati Python, esegue CRUD dai controlli della pagina, termina il browser e lo
riavvia con lo stesso profilo, ancora offline. Modello completo, migrate, catalogo
SQLite e valori sono confrontati prima/dopo con il riferimento Python; il file realmente
scaricato viene poi verificato dal ricevitore Python. Il test controlla zero richieste
HTTP/HTTPS e l'isolamento tra percorsi. Una seconda prova conserva Bag annidate,
attributi, blob, vuoti e NULL dopo reload da `file://`.

Anche **Safari desktop 27.0.1** è stato verificato con l'automazione MCP ufficiale:
caricamento, CRUD, chiusura e riapertura della scheda, recupero da IndexedDB e ritorno
accettato da Python con gli stessi confronti completi. Il test ha evidenziato un
`NotReadableError` leggendo un `File` trasferito al worker Blob; la pagina ora legge
il file e passa il testo al worker.

```sh
# Dopo build:file, su macOS con Safari 27+ e automazione remota abilitata:
python3 scripts/test_safari_file.py
.reference/venv-current/bin/python scripts/transfer_oracle.py \
  --verify-return output/safari-transfer-returns.json
```

La prova Safari riapre la scheda nella stessa sessione automatizzata: non verifica
il riavvio completo del processo né la rete fisicamente disconnessa. MCP fornisce i
byte Python al normale input file e acquisisce il Blob prodotto dall'export: il
selettore file del sistema e il download salvato su disco restano da verificare.
Il caso Bag/blob su Safari, Firefox e i tablet non sono ancora qualificati.
