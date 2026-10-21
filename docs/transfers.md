# Snapshot Python → browser → Python

Il layer trasferisce **Bag sorgente e record**, senza implementare sincronizzazione,
conflitti, proprietà dei record o autorizzazioni. L’applicazione sceglie quali dati
inviare e come applicare quelli restituiti. Non serve eseguire Python nel browser.

## Python: preparare lo snapshot

Il modulo `python/asqueel_transfer.py` usa Asqueel, genro-builders, genro-bag e
TYTX già disponibili nell’applicazione Python. Il riferimento verificato è
Asqueel 0.6.1 + fix #44, come il resto del porting.

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

Tipi scalari attualmente supportati: A, B, C, D, DH, DHZ, H, I, L, N, R, T.
Le date conservano la rappresentazione civile, il fuso e i microsecondi.
La precisione dei numeri resta quella di SQLite: NUMERIC non è un archivio
Decimal arbitrariamente preciso. Gli interi oltre la precisione sicura JS
vengono rifiutati; Bag/blob e valori strutturati non sono ancora snapshot dati
supportati. Gli snapshot piccoli sono materializzati in memoria.

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
