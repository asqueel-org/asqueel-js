# Playground Asqueel JS

Il PoC carica la grammatica canonica di `SqlBuilder` esportata in JSON, costruisce
un modello con `@genrojs/builders` e produce il JSON normalizzato `structure-1.0`
consumato da Asqueel Migration. La generazione funziona in Node.js, Bun e browser,
senza Python a runtime. Nel browser è disponibile anche una prima migrazione
reale su SQLite WebAssembly persistito in IndexedDB.

## Provarlo

Dalla radice del repository:

```sh
npm ci
npm run example
npm run example -- --application
npm run browser
```

Aprire <http://127.0.0.1:8092>. L'editor consente di modificare il modello, generare
il risultato e scaricare `migration.json`. Il modello viene eseguito localmente
come normale codice JavaScript. Le modifiche dell'editor non vengono salvate
quando si ricarica la pagina.

Il playground parte dall'esempio SQLite con query e ricorda l'ultimo esempio
selezionato, ma non le modifiche al testo dell'editor. È possibile selezionare
anche il modello fisico, visualizzare il riferimento Python e leggere le
differenze. Il confronto nel browser usa l'oracolo salvato dell'esempio originale:
non esegue Python sul codice modificato nell'editor.

## Migrare nel browser

1. Selezionare **SQLite · versione 1**, poi **Calcola piano SQL** e **Applica
   migrazione**: crea due tabelle con campi di sistema, PK, UNIQUE, FK e indici.
2. **Inserisci dati di prova** aggiunge un cliente e una fattura.
3. Selezionare **SQLite · versione 2 con email**: il piano contiene solamente
   `ADD COLUMN email` e il relativo `CREATE INDEX`.
4. Applicare e ricaricare la pagina: schema e righe rimangono presenti. Il piano
   della versione 2 torna vuoto. **Riapri database** verifica anche una nuova
   connessione senza ricaricare la pagina.
5. **Verifica SQLite** esegue sette verifiche reali su WASM/IndexedDB in un
   database di test separato, eliminato al termine.

Il database applicativo IndexedDB si chiama `asqueel-js-playground-v1`; il file
SQLite virtuale è `browser.db`. Il sito lo riapre automaticamente. Non esiste
un reset automatico: tornare alla versione 1 dopo aver applicato la 2 segnala
la rimozione non supportata di `email`. Cancellare i dati del sito elimina anche
il database. Cambiare host o porta cambia l'origine e quindi lo storage.

L'adapter usa `wa-sqlite@1.0.0`, build Asyncify e `IDBBatchAtomicVFS` con durabilità
`strict`, all'interno di un Web Worker. Asset JS/WASM vengono serviti localmente,
senza CDN. Servono IndexedDB e Web Locks in un contesto sicuro (localhost o HTTPS).
È un PoC; il VFS distribuito da wa-sqlite è un'implementazione di esempio e qui
non viene certificata la robustezza contro crash del browser o esaurimento quota.

`src/sqlite.js` condivide reader, piano ed esecuzione fra runtime tramite
`query(sql, params)` e `execute(sql, params)`. Le operazioni browser sono
serializzate nel worker e fra tab mediante Web Locks. L'esecuzione ricalcola il
piano dentro `BEGIN IMMEDIATE`, applica le istruzioni, rilegge il catalogo,
richiede diff vuoto e `foreign_key_check` senza errori, poi esegue `COMMIT`.
Ogni errore prima del commit provoca `ROLLBACK`.

Questo primo migratore supporta **solo `main`** e migrazioni additive: nuove
tabelle, colonne nullable e indici non univoci, anche parziali/ordinati.
Le nuove tabelle supportano chiavi composte, UNIQUE e FK anche differibili.
Nomi fisici dei vincoli vengono ignorati nel diff, come nel default Python.
Commenti non memorizzabili vengono segnalati. Rimozioni, alterazioni di
tipo/default/vincoli, CHECK, colonne generate, viste, trigger, collation,
indici su espressioni e indici UNIQUE espliciti vengono rifiutati. Usare
`unique` sul campo o un vincolo UNIQUE; usare `I` per le PK intere.
Il PoC non ricostruisce tabelle e non è il porting completo di `SqlMigrator`.

Il controllo browser confronta sia il modello desiderato sia il **catalogo
SQLite effettivamente riletto** con gli oracoli Python; non salva il modello
desiderato come sostituto dell'introspezione. Gli hook applicativi delle opzioni
(ID automatici, timestamp, audit, contatori) restano fuori perimetro: la demo
inserisce esplicitamente gli ID dei record.

## Inserimenti e query dal modello

Selezionare **SQLite · inserimenti e query** e applicare il piano: alle tabelle
precedenti aggiunge `query_people` e `q_memo`, senza rimuovere dati. Il modello
indipendente è in `examples/browser-queries.js` e `examples/browser_queries.py`.

Il pannello query consente di modificare una richiesta JSON, confrontare SQL e
parametri con l'esempio Python ed eseguirla nel worker. Gli esempi 1–5 inseriscono
due persone e tre note; gli altri leggono quei dati con filtri e una relazione.
Gli ID sono fissi: ripetere un INSERT provoca un errore di chiave duplicata,
senza sovrascrivere il record. I dati rimangono dopo un reload; selezionare poi
una richiesta di lettura.

L'API JavaScript usa i nomi **logici** del modello:

```javascript
const db = model.queries(adapter); // adapter SQLite aperto e modello già migrato
await db.table('notes.person').insert(
    {id: 101, name: 'Ada', active: true},
    {returning: '$id,$name'}
);
const query = db.table('notes.memo').query({
    columns: '$id,$body,@person_id.name AS person,$amount',
    where: '$amount >= :minimum',
    sqlparams: {minimum: 10},
    order_by: '$id'
});
console.log(query.compiled); // {sql, params}
const rows = await query.fetch();
```

`model.queries().compile(request)` permette la compilazione senza connessione.
Il resolver condiviso con migrate traduce package, prefissi e nomi SQL:
`notes.person.name` diventa `main.query_people.display_name`; `@person_id.name`
genera un LEFT JOIN. Il worker ricostruisce il modello da dati e ricompila la
richiesta prima dell'esecuzione: il SQL mostrato viene verificato contro quello
del worker.

Perimetro: INSERT con RETURNING opzionale; SELECT di campi fisici, alias ed
espressioni con alias esplicito; navigazione di relazioni dirette fisiche,
parametri scalari e liste `IN`/`NOT IN` (anche vuote), ordinamento, limit/offset.
La sintassi `$campo`, `@relazione.campo` e `:parametro` viene riconosciuta fuori da
stringhe e commenti SQL. I valori restano separati dal testo SQL. I frammenti
di espressione sono codice dell'applicazione, non input da utenti non fidati.
Booleani diventano 0/1 soltanto al confine del driver; i risultati sono righe
SQLite semplici, senza i codec del runtime Python.

Sono rifiutati campi/tabelle sconosciuti, parametri mancanti, valori non scalari,
interi JS non sicuri, macro, sottoquery, ILIKE, GROUP BY/HAVING/DISTINCT, update/
delete, colonne virtuali richieste, codec applicativi e hook/opzioni attivi sulla
tabella interrogata. Non è un porting completo del compiler Python. Il confronto
usa `QueryCompiler(resolve_model(...), SqliteDialect(), SqliteDriver())`, con
uguaglianza esatta del testo SQL, dei parametri e delle righe su SQLite reale.

Il modello mantiene le vecchie tabelle con `sys_fields` per migrate, ma le
scritture dimostrative riguardano le nuove tabelle esplicite. Nel riferimento iniziale del PoC l'API pubblica
Python rifiutava le scritture con `sys_fields`: problema documentato
nella [issue #29](https://github.com/asqueel-org/asqueel/issues/29#issuecomment-6298801145).
Non vengono disabilitati controlli per aggirare quel limite.

**Verifica query con Python** esegue cinque controlli in un database IndexedDB
separato: modello/migrazione, 18 SQL con parametri, 18 risultati, rollback di
INSERT duplicato e rilettura con JOIN dopo riapertura. Nel browser il riferimento
Python è salvato per l'esempio originale; modificare la richiesta non avvia un
processo Python. La verifica dal vivo è disponibile con `verify:python`.

## Esempi da terminale

`npm run example` scrive `output/migration.json`; `--application` scrive
`output/application-migration.json`. Per Bun:

```sh
bun examples/render.js
bun examples/render.js --application
```

Le dipendenze richiedono Node.js >= 22 oppure un Bun compatibile. Verificato
su Node 23.11.0 e Bun 1.3.14.

## Dichiarare un modello

```javascript
import {defineModel} from './src/index.js';

const model = defineModel(root => {
    const db = root.db({name: 'demo'});
    const pkg = db.packages().package({name: 'crm', sqlschema: 'public'});
    const tables = pkg.tables();
    const customer = tables.table({name: 'customer'});
    customer.options().sys_fields({draft: true});
    const columns = customer.columns();
    columns.column({name: 'name', dtype: 'T', notnull: true});
});

const migration = model.toMigration();
console.log(JSON.stringify(migration, null, 2));
```

È disponibile anche `class Shop extends SqlBuilder { main(root) { ... } }`:
creare l'istanza, chiamare `model.create()` e poi `model.toMigration()`.
Le dichiarazioni sono sincrone e usano gli attributi in un oggetto JS. I contenitori sono idempotenti e sono disponibili le scorciatoie
`package.table()` e `table.column()`. Contributi, ripetizioni e reset sono descritti
in [composizione](composition.md).

Gli esempi indipendenti in JS e Python sono
[application.js](../examples/application.js) / [application.py](../examples/application.py)
per package e opzioni, e [shop.js](../examples/shop.js) / [shop.py](../examples/shop.py)
per il modello fisico.

## Confine del PoC

Supporta la produzione del modello **fisico**:

- database, schemi, tabelle, colonne e chiavi primarie anche composte;
- tipi fisici del contratto, dimensioni, nullabilità, default SQL e commenti;
- foreign key fra schemi, target espliciti o pkey del target, chiavi composte,
  azioni e differibilità;
- vincoli UNIQUE/CHECK, indici espliciti e automatici;
- esclusione delle colonne virtuali e dei metadati UI dal JSON fisico;
- hash strutturali identici al migratore Python.

Il percorso applicativo aggiunge:

- package, dipendenze `requires`, schemi derivati, prefissi e nomi SQL espliciti;
- tipi personalizzati di package e normalizzazione dei tipi di storage;
- inferenza di tipo/dimensione dalle relazioni, riferimenti fra package,
  nomi di colonne rimappati e indici per le relazioni deboli;
- espansione fisica di `sys_fields`, `hierarchical`, `attachments`,
  `auto_counter`, `relative_index`, `audit`, `full_update`, `record_hash`,
  `dynamic_fields` e `protection`;
- altre opzioni dichiarative senza effetti DDL, opzioni disabilitate,
  attributi espliciti dei campi generati e controlli sui conflitti.

Come Python, il modello a package deriva gli schemi da `sqlschema` e non può
contenere contemporaneamente un contenitore `schemas` esplicito. Le opzioni
sono utilizzabili anche sulle tabelle degli schemi espliciti. `system_records`
e `release` abilitati restano rifiutati, come nel renderer Python corrente.

La grammatica JSON fornisce dichiarazioni, firme, default e vincoli; le
trasformazioni applicative sono implementate in `src/application.js` e
`src/options.js`. Caricare la grammatica, da solo, non esegue gli hook Python.

Colgroups e subtables sono disponibili nel modello e nella proiezione migrate;
il nuovo esempio omonimo e il pulsante **Verifica composizione con Python**
mostrano il confronto. La verifica usa database temporanei separati da quello
del playground e prova anche migrazione, INSERT/SELECT e riapertura IndexedDB.
Le subtables producono colonne virtuali booleane nel modello, senza tabelle o
colonne fisiche aggiuntive. I loro filtri non sono ancora eseguiti dalle query.

Restano fuori perimetro policy runtime `x_`, foreign key fisiche
su colonne virtuali e riscrittura SQL di CHECK/indici parziali su colonne
rimappate. Sul percorso fisico senza package/opzioni restano richiesti nomi
dichiarati coincidenti con quelli SQL. Non sono implementati il
modello operativo completo e gli hook del runtime applicativo.
Compiler, adapter e migrazione SQLite browser hanno il perimetro descritto sopra.

La grammatica resta interamente condivisa; il renderer implementa un sottoinsieme
esplicito. I controlli di dominio JS non sostituiscono ancora l'intero
`SqlModelValidator` Python: prima di usare un modello nuovo per una migrazione,
passare il risultato a `StructureValidator` del migratore.

## Verifiche

```sh
npm test
npm run test:bun
```

I 159 test verificano l'uguaglianza completa con gli oracoli Python dichiarati, gli hash anche
con Unicode e ordine diverso delle colonne, la ripetibilità, la validazione e
il rifiuto delle funzionalità fuori perimetro. Il corpus include 53 casi
applicativi e due esempi scritti indipendentemente nei due linguaggi. Copre
opzioni abilitate/disabilitate, gerarchie collegate, allegati, tipi, prefissi,
relazioni anticipate e chiavi composte. Si confrontano oggetti JSON, non l'ordine delle
proprietà o la formattazione del testo. Cinque test usano SQLite reale via
`node:sqlite` / `bun:sqlite` e verificano migrazione incrementale, conservazione
dei dati, idempotenza, rollback, chiavi composte e FK differibili. I sette
controlli browser di migrazione usano invece il vero driver WASM e IndexedDB.
I test query confrontano 18 compilazioni ed esecuzioni con Python; il browser
aggiunge i cinque controlli descritti sopra.

Per confrontare **dal vivo** Node/Bun con il renderer Python e far validare
55 risultati di ciascun runtime al vero migratore, più i modelli e i cataloghi
di due migrazioni SQLite e 18 query eseguite indipendentemente in Python e JS:

```sh
PYTHON=/percorso/python-con-dipendenze-asqueel npm run verify:python
```

Gli script Python leggono i checkout fratelli `../asqueel` e
`../asqueel-migration`, oppure i percorsi configurati con `ASQUEEL_PYTHON_ROOT`
e `ASQUEEL_MIGRATION_ROOT` (vedi [parità](parity.md)); l'interprete deve avere le rispettive dipendenze
Python, inclusi `genro-builders`, `genro-bag`, `genro-toolbox`, `dictdiffer` e
`jsonschema`. Non installano né aggiornano dipendenze automaticamente.

La verifica iniziale usa il migratore del checkout locale, versione 0.3.1:
non certifica la compatibilità con tutte le versioni pubblicate del migratore.
Versioni e commit di riferimento sono in
[test/fixtures/provenance.json](../test/fixtures/provenance.json).

Per rigenerare grammatica, costanti del contratto e oracoli dopo modifiche Python:

```sh
PYTHON=/percorso/python-con-dipendenze-asqueel npm run export:python
npm test
npm run test:bun
```

Per rigenerare soltanto l'oracolo SQLite:

```sh
PYTHON=/percorso/python-con-dipendenze-asqueel npm run export:sqlite
PYTHON=/percorso/python-con-dipendenze-asqueel npm run export:queries
```

Non modificare a mano `src/generated/` o `test/fixtures/`: sono derivati dalle
fonti Python. Il caricamento usa `BuilderBase.defineGrammar()` e il formato
`builder_grammar` esistente, senza una seconda lista di dichiarazioni JS.
Le costanti fisiche provengono da `asqueel-migration`; la piccola implementazione
JS delle factory e degli hash è verificata contro quelle Python.
