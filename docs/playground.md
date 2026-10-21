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

Aprire <http://127.0.0.1:8092>. La root è una **IndexPage Gramlot**, con albero di
navigazione, pannello laterale ridimensionabile/richiudibile e schede persistenti.
Le tre pagine vengono aperte in iframe dalla shell:

- **Modello** (`?page=models`, pagina iniziale): editor, JSON migrate JavaScript/Python,
  JSON completo del modello, download e verifiche di composizione.
- **Migrazioni SQLite** (`?page=sqlite`): piano SQL, applicazione, dati di prova,
  catalogo, riapertura e verifiche SQLite.
- **Query** (`?page=queries`): richiesta JSON, SQL e parametri, esecuzione e confronto
  con le fixture Python 0.6.1 + fix #44.

Il modello viene eseguito localmente come normale codice JavaScript. Esempio e
bozza vengono salvati in localStorage e condivisi tra le tre pagine, anche dopo
un reload. Le pagine già aperte ricevono le modifiche tramite l'evento `storage`;
se una pagina sta eseguendo un'operazione, le applica al termine. Cambiare scheda
conserva editor, cronologia e risultati. Ricaricare la shell ricrea le schede,
riaprendo la pagina indicata nell'URL; restano la bozza e i dati SQLite.
**Ripristina esempio** sostituisce la bozza con la ricetta originale.
Senza localStorage disponibile la pagina funziona, ma non conserva la bozza.
Il confronto usa l'oracolo salvato dell'esempio originale: non esegue Python sul
codice modificato nell'editor.

Le dichiarazioni sono in `browser/pages/`: classi `Page` con elementi Source,
binding `^path` e azioni nominate. `browser/logic.js` esporta la `Logic` che aggiorna
la Data Bag; i servizi SQLite/query non manipolano il DOM. Gramlot serverless
esegue la Page in un worker dedicato, distinto dal worker SQLite. La pagina HTML
contiene soltanto il contenitore e il bootstrap. La shell richiede almeno
`@gramlot/gramlot@0.3.8` e `@gramlot/gramlot-serverless@0.2.15`, solo per il playground.
Queste sono anche le versioni verificate in questo aggiornamento; non sono previsti
limiti superiori. Usare `npm run update:tools` prima delle verifiche sugli ultimi tool.

L'authoring segue [Writing pages (GC-095)](https://github.com/gramlot-org/gramlot/blob/main/docs/public/095-writing-pages.md):
`dataSetter` inizializza Data, `_onStart` avvia la Logic, `node.GET/SET` accede
ai valori. Gli editor CodeMirror 6 usano una collection locale Gramlot con
`value: '^path'`: ogni modifica viene trasferita a Data dal `ComponentControl`,
senza textarea nascosti o scritture Data duplicate. Le azioni
usano `button` con un `dataController` figlio; i parametri passano al controller,
senza recuperarli dal DOM. Gli eventi nativi restano per select, editor e link.
Il gruppo nominato `playground` viene registrato dal nostro host serverless.
Il download conserva direttamente il JSON migrate: `utl.inout.download` è per
rami Bag, non per questo documento JSON già serializzato.

La shell usa `IndexPage`/`FramePage`, `IndexLogic`, una Bag di navigazione e le
collection ufficiali `layout` e `tree`. Le regioni top/left/bottom personalizzano
il contenuto dell'applicazione; il coordinatore Gramlot gestisce i pannelli remoti
e il `tabContainer`. Su telefono la navigazione parte chiusa e si apre dal drawer.
Il tema `gramlot-base` è servito localmente per root e iframe. Il build ESM con
chunk condivisi evita copie separate del runtime e delle classi Bag nello stesso
documento. Le stesse collection sono registrate nel server per richieste iniziali
e frammenti remoti.
Gli editor JavaScript e JSON offrono evidenziazione della sintassi, numeri di riga,
ricerca e annulla/ripeti. CodeMirror è incluso nei bundle locali, senza CDN;
la sua collection è in `browser/editors.js`, con grammatica separata per il worker.
I risultati JSON restano pannelli di sola lettura. Gli URL pubblici `?page=…` aprono
la shell sulla pagina richiesta e seguono la navigazione (anche Indietro).
Il parametro interno `&embedded=1` carica soltanto una pagina figlia.

## Migrare nel browser

1. Aprire **Migrazioni SQLite**, selezionare **SQLite · versione 1**, poi **Calcola piano SQL** e **Applica
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
desiderato come sostituto dell'introspezione. Questa demo di migrazione inserisce esplicitamente gli ID. Il pulsante
«Verifica sys_fields e hook» nella pagina Query esegue invece il ciclo applicativo
con ID automatici e timestamp; «Verifica gerarchie e contatori» prova anche percorsi e numerazione automatica.

## Inserimenti e query dal modello

Aprire **Query**, selezionare **SQLite · inserimenti e query** e applicare il piano: alle tabelle
precedenti aggiunge `query_people` e `q_memo`, senza rimuovere dati. Il modello
indipendente è in `examples/browser-queries.js` e `examples/browser_queries.py`.

Il pannello query consente di modificare una richiesta JSON, confrontare SQL e
parametri con l'esempio Python ed eseguirla nel worker. Gli esempi 1–5 inseriscono
due persone e tre note; i casi successivi mostrano letture, aggregazioni e un ciclo UPDATE/DELETE su un record temporaneo.
Gli ID sono fissi: ripetere un INSERT provoca un errore di chiave duplicata,
senza sovrascrivere il record. I dati rimangono dopo un reload; selezionare poi
una richiesta di lettura.

L'API JavaScript usa i nomi **logici** del modello:

```javascript
const db = model.queries(adapter); // adapter SQLite aperto e modello già migrato
await db.table('notes.person').insert(
    {id: 101, name: 'Ada', active: true}
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

Il compilatore segue Python 0.6.1 + fix #44 per il sottoinsieme verificato:
INSERT/UPDATE/DELETE per chiave primaria anche composta, RETURNING automatico dei
default SQL, `sql_value` e colonne generate; SELECT di campi, alias, colonne composte
e formule annidate con parametri locali (`var_*`, `var_kwargs`), `#THIS` e `#ENV`,
relazioni dirette anche composte, GROUP BY/HAVING/DISTINCT, IN/NOT IN, ordine e
paginazione. Draft e logical deletion filtrano le letture; `environment` esplicito
fornisce valori `current_*`/`allowed_*` per le partizioni e parametri `:env_*`.

```javascript
const queries = model.queries(adapter);
await queries.transaction(async tx => {
    const people = tx.table('notes.person');
    const record = await people.insert({id: 104, name: 'Nuova persona'});
    await people.update({name: 'Nome modificato'}, {pkey: record.id});
    console.log(await people.query({where: '$id=:id', sqlparams: {id: record.id}}).fetchRecord());
    await people.delete(record.id);
});
```

`insert` e `update` restituiscono lo stesso record passato, arricchito dai valori
SQL restituiti; `delete` restituisce `undefined`. `execute(request)` restituisce
invece le righe SQL grezze. `returning` esplicito non fa più parte del contratto.
`fetchRecord()` segnala zero/più record con `RecordNotFoundError` e
`RecordMultipleRowsError`; `fetchRecord(true)` restituisce `null` se assente.
Con `order_by` esplicito restituisce il primo record. `count()` conta gruppi o
righe distinte quando richiesto; `exists()` verifica la presenza di almeno una riga.
Le righe sono oggetti SQLite semplici, senza codec/metadati del runtime Python.

Durante una transazione usare il contesto `tx` e attendere tutte le operazioni.
Un errore SQL annulla l'intera transazione anche se intercettato nel callback;
transazioni annidate e uso del contesto dopo la chiusura sono rifiutati.
Le operazioni attraverso la stessa istanza adapter sono serializzate; accesso
diretto all'adapter e migrazioni richiedono coordinamento esterno.

Per compatibilità con Python, un parametro assente diventa NULL, un INSERT
omette i valori null (lasciando agire i default), e `limit: 0` non aggiunge LIMIT.
Il parser Python sostituisce riferimenti `$campo` anche nei letterali SQL: anche
questa particolarità è riprodotta. Passare testi utente tramite parametri, non
come frammenti di espressione. Collisioni nei nomi generati per liste vengono
rifiutate esplicitamente in JS. Booleani diventano 0/1 al confine del driver.

Restano fuori dal perimetro altre macro, navigazione diretta attraverso relazioni molti,
callback applicative delle formule e dell'ambiente, codec applicativi, lock,
scritture bulk/da selezione, azioni applicative su relazioni composte,
e opzioni diverse da `sys_fields`, `hierarchical`, `auto_counter` e `relative_index`.
Gli hook sono ora eseguiti dai metodi `table.insert/update/delete`; il livello
SQL `compile/execute` resta separato e rifiuta dichiarazioni che richiedono hook. La migrazione JS di colonne generate resta esclusa: i relativi
test query preparano lo schema con il DDL del migratore Python.

**Verifica query con Python** esegue quattordici gruppi di controlli in database
IndexedDB separati: modello/migrate, 32 compilazioni/esecuzioni base, rollback,
helper e transazioni, 28 casi aggiuntivi, 32 casi di formule parametrizzate/chiavi
composte, 48 casi di sottoquery/aggregazioni e 17 query rifiutate,
con rilettura di tutte le nuove SELECT dopo riapertura. Gli oracoli
Python sono salvati: modificare una richiesta nell'editor non avvia Python.
Il confronto dal vivo, incluso in CI, si esegue con `verify:python`.

## sys_fields e hook applicativi

`table.insert/update/delete` eseguono il ciclo di Python 0.6.1 + fix #44:
protezioni/default, assegnazione della chiave, validazione, trigger di campo,
hook di tabella, SQL, trigger di campo e hook successivi. L'ordine di draft e
contatori segue quello specifico di INSERT/UPDATE/DELETE. I callback dei contatori
restano punti di estensione; `auto_counter` e `relative_index` sono ora eseguiti.

```javascript
const model = defineModel(root => {
    const table = root.db({name: 'local', implementation: 'sqlite'})
        .packages().package('app').table('note');
    table.options().sys_fields();
    table.column({name: 'title', dtype: 'T'});
});
await migrateSQLite(adapter, model.toMigration());
const db = model.queries(adapter, {
    environment: {user: 'ada'},
    hooks: {
        'app.note': {
            async trigger_onInserting(record) {
                record.title = record.title.trim();
            },
            async trigger_onUpdated(record, {old_record}) {
                // Altre scritture devono usare this.db: stessa transazione.
                // await this.db.table('app.log').insert({...});
            }
        }
    }
});
const note = await db.table('app.note').insert({title: ' Una nota '});
await db.table('app.note').update({...note, title: 'Modificata'}, {old_record: {...note}});
await db.table('app.note').delete(note.id);
```

I nomi degli hook restano quelli Python: `trigger_onInserting/Inserted`,
`trigger_onUpdating/Updated`, `trigger_onDeleting/Deleted`, `protect_validate`,
`protect_update`, `protect_delete`, `protect_draft`, `trigger_assignCounters`,
`trigger_releaseCounters`, `newPkeyValue`. Sono metodi normali, non arrow function
quando usano `this`. In JS gli argomenti nominati Python sono il secondo oggetto:
`{old_record}` oppure `{fldname, tblname, old_record}` per i trigger di campo.
Una dichiarazione `onInserting: 'normalize'` richiama `trigger_normalize`;
`trigger_table` sceglie un'altra tabella registrata. Un nome senza implementazione
produce un errore, non viene ignorato. I trigger built-in `setTSNow` e
`setCurrentUser` sono disponibili e possono essere sovrascritti nel registro.

Il contesto espone `this.db`, `this.model`, `this.fullname`, `this.currentUser`
e `this.currentTrigger` (evento, tabella, record, vecchio record e parent).
`this.db.currentTrigger` e `this.db.currentUser` sono disponibili anche negli hook
annidati. Tutte le operazioni asincrone vanno attese. Una validazione, un hook o
uno statement fallito rendono l'intera transazione rollback-only, anche se l'errore
viene intercettato. I record JS già modificati dagli hook non vengono ripristinati
in memoria al rollback, come in Python. I contesti scadono quando termina il ciclo.

`environment` può essere un oggetto o una funzione: viene copiato all'inizio della
transazione. Non è il contesto mutabile/thread-local Python. `clock({table, field,
dtype})` e `uuid()` possono essere iniettati per test deterministici e devono essere
sincroni. Il default genera ID legacy22 (Z + timestamp base62 + casualità) e usa
l'orologio locale: timestamp UTC per DHZ, locali senza timezone per DH.
Le date del runtime sono stringhe ISO compatibili con la memorizzazione Python,
con microsecondi testuali e offset `+00:00` per UTC; l'orologio Date nativo ha
precisione al millisecondo. Non è ancora un codec generale Date/Decimal/Bag.

UPDATE rilegge il record quando necessario per campi protetti o partizioni,
mantiene la chiave del vecchio snapshot anche se un hook modifica `old_record`,
e rifiuta cambiamenti a `read_only`/`unmodifiable`. DELETE con chiave stringa
rilegge il record completo e non fa nulla se assente; con un oggetto deve eliminare
esattamente una riga. Anche le chiavi numeriche JS sono accettate come chiavi di
rilettura, per compatibilità con l'API JS già introdotta.

«Verifica sys_fields e hook» esegue **26 scenari reali** su database IndexedDB
temporanei: confronta modello, JSON migrate, record restituiti/modificati, ordine
degli eventi, SQL e parametri DML, righe persistite e rollback. Chiude e riapre il
database dopo ciascuno scenario. Il pannello mostra anche un risultato realmente
eseguito, inclusi gli eventi di una scrittura annidata. Gli hook dimostrativi sono
moduli JS importati nel worker: funzioni e callback non vengono serializzati nel
JSON del modello né trasferiti come testo da eseguire.

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

La grammatica JSON fornisce firme, default e vincoli. `model-options.js` espande
le opzioni e `model.js` costruisce la gerarchia e la proiezione fisica. Nessun hook
applicativo viene eseguito dalla risoluzione.

## Modello completo 0.6.1

Il pannello «Modello risolto completo» mostra il JSON gerarchico. Gli esempi
application, shop, groups, virtual-relations e queries hanno un riferimento Python
completo; il messaggio di parità del modello è distinto da quello di migrate.
Il pulsante di verifica della composizione esegue nel worker l'intero corpus
modello/migrate e prove reali su database IndexedDB temporanei.
I 140 casi query usano lo stesso riferimento 0.6.1 + fix #44 del modello.

L'esempio gruppi usa una formula esplicita: `subtable` non esiste più nella
0.6.1. `virtualRelation` conserva tutti i dati della dichiarazione senza produrre
FK fisiche. Le aggregazioni dichiarative vengono eseguite come sottoquery correlate;
la navigazione come JOIN diretto resta esclusa. Vedi il [contratto del modello](model.md) per API,
limiti del JSON portabile e differenze rispetto al vecchio riferimento.

Il look usa gli stessi temi `gramlot-base`, `gramlot-compact` e `gramlot-index`
della gallery: barra da 42 px, accento giallo, token condivisi e CodeMirror integrato.


## Gerarchie e contatori automatici

Le dichiarazioni restano quelle del modello portabile; i metodi di tabella
eseguono i comportamenti dentro la stessa transazione degli hook:

```javascript
const model = defineModel(root => {
    const pkg = root.db({name: 'local', implementation: 'sqlite'}).packages().package('app');
    const category = pkg.table('category');
    category.options().sys_fields();
    category.options().hierarchical({columns: 'code', root_id: true, virtual_roots: true});
    category.options().auto_counter();
    category.column('code');
});
await migrateSQLite(adapter, model.toMigration());
const db = model.queries(adapter, {environment: {user: 'ada'}});
await db.transaction(async tx => {
    const category = tx.table('app.category');
    const first = await category.insert({code: 'first'});
    const second = await category.insert({code: 'second'});
    const child = await category.insert({code: 'child', parent_id: first.id});
    await category.update({id: child.id, parent_id: second.id}, {old_record: child});
});
```

Uno spostamento assegna l'ultima posizione fra i nuovi fratelli, ricalcola percorsi,
`root_id` e `_h_count`, quindi aggiorna i discendenti tramite il normale ciclo di
scrittura, compresi gli hook. UPDATE gerarchico richiede `old_record`, riletto dal
database prima di usarlo. Sono rifiutati cicli, genitori inesistenti, modifica della
chiave, contatori non interi/non negativi e nuove posizioni oltre 1295. Eliminare un
nodo elimina i discendenti; l'archiviazione logica si propaga ai discendenti che
hanno il relativo campo. `linked_to` crea e aggiorna la radice associata al master,
anche quando SQLite ne genera la chiave.

`auto_counter({field: 'position', scope: ['group_id', 'kind']})` usa il massimo
esistente più uno nel gruppo, includendo righe draft/archiviate e trattando NULL
come gruppo distinto. Conserva i valori espliciti; cancellando il massimo, il
numero può essere riutilizzato. Nelle gerarchie il gruppo è il genitore.
`relative_index('master_id')` aggiorna invece il contatore in `master_xtd`:
il numero non viene riutilizzato dopo la cancellazione del dettaglio. Il modello
deve dichiarare il master, la tabella di estensione con chiave `id` o `main_id`
e la relazione del dettaglio. Un rollback annulla anche l'allocazione del numero.
Vedere le dichiarazioni complete in `examples/hierarchies.js`.

**Verifica gerarchie e contatori** nella pagina Query esegue 39 scenari reali in
SQLite WASM, confronta record/eventi/SQL/parametri con Python e riapre ogni database
IndexedDB per verificarne i dati. Mostra anche il risultato di uno spostamento
con sottoalbero. Il riferimento è salvato nel bundle: Python non gira nel browser.

Le operazioni usano `BEGIN IMMEDIATE` e le riserve SQLite del riferimento Python.
La coda serializza le richieste sullo stesso adapter; non è ancora una garanzia
verificata per applicazioni con più schede aperte. Gli interi JS sicuri vengono
passati come INTEGER SQLite in tutti e tre gli adapter, evitando differenze di
affinità testuale. Restano esclusi audit, altre opzioni, azioni applicative
su relazioni composte e macro gerarchiche avanzate. I campi fisici di percorso
sono leggibili; il compilatore supporta ora le sottoquery dichiarative, mentre
il corpus gerarchico dedicato resta concentrato sul ciclo di scrittura.


## Cascade applicative onUpdate

Una relazione su colonne fisiche può dichiarare `onUpdate: 'cascade'`, `'raise'`
o `'ignore'`. Il ciclo scrive prima il padre, poi cerca i figli che referenziano
il vecchio valore. Con `cascade` aggiorna ciascuno attraverso `table.update`,
eseguendo protezioni, trigger di campo, hook di tabella ed eventuali ulteriori
cascade nella stessa transazione. Gli after-hook dei figli precedono quelli del
padre. Un errore, anche in un discendente, annulla tutte le scritture.

```javascript
child.column('parent_code').relation('app.parent.code', {
    onUpdate: 'cascade',
    onUpdate_sql: 'no action',
    deferred: true,
});
// parent.code deve essere una chiave candidata (PK o UNIQUE).
await db.table('app.parent').update({...oldParent, code: 'new'}, {
    old_record: oldParent,
});
```

`old_record` è necessario per le relazioni con `onUpdate` attivo; può essere
riletto dal ciclo quando sono presenti protezioni/partizioni che lo richiedono.
Conservare nel record i campi referenziati: nel contratto Python un campo omesso
viene confrontato come NULL e può causare un errore se ci sono figli da aggiornare.
Una relazione invariata viene saltata, senza interrompere le successive.
`raise` rifiuta la modifica se trova figli; `ignore` non li aggiorna e lascia
comunque agire gli eventuali vincoli SQL.

La ricerca dei figli include draft, archiviati e tutte le partizioni; la scrittura
di ciascun figlio applica però la partizione attiva. Un figlio esterno alla
partizione può quindi far fallire e annullare l'intera operazione, come in Python.

`onUpdate_sql` è distinto da `onUpdate`: il default delle FK è la cascade SQLite.
Se SQLite ha già propagato il nuovo valore, la ricerca applicativa sulla vecchia
chiave non trova figli e non esegue i loro hook. Usare `onUpdate_sql: 'no action'`
e `deferred: true`, come nell'esempio, quando si desidera la propagazione tramite
il ciclo applicativo mantenendo la verifica della FK al commit.

**Verifica cascade onUpdate** esegue 27 scenari su database IndexedDB separati e
mostra un esempio con padre, figli e nipoti, hook e SQL confrontati con Python.
Le azioni su relazioni composte restano rifiutate esplicitamente.

## Sottoquery e aggregazioni inverse nel browser

**Verifica query con Python** include 48 casi di sottoquery e aggregazioni e 17
configurazioni rifiutate. Il worker crea un database separato, confronta SQL e
parametri con l'oracolo Python e poi esegue realmente ogni richiesta su SQLite
WASM. Dopo la riapertura IndexedDB ripete tutte le SELECT e confronta i risultati.
I dettagli compaiono in **Verifiche query nel browser**; il totale è di 140 query.

Le ricette indipendenti e la semantica di correlazione, binding e filtri sono in
[parity.md](parity.md#sottoquery-e-aggregazioni-inverse). Il confronto browser usa
fixture Python salvate; `npm run verify:python` rigenera i risultati in memoria dal
riferimento fissato e li confronta con Node e Bun.
