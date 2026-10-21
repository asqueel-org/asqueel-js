# Confronto con Python 0.6.1

`test/fixtures/provenance.json` fissa core **0.6.1 + fix #44 / 8a8ffd3**, migration **0.3.1**
e genro-builders **0.29.0**. La CI fa checkout di quei commit, senza seguire `main`.
Il verificatore rifiuta un checkout Python di un'altra versione.

Il riferimento include la correzione Python della [issue #44](https://github.com/asqueel-org/asqueel/issues/44), successiva alla release pubblicata v0.6.1.
I 218 casi includono 14 regressioni aggiunte per gerarchie collegate, contatori e
parent personalizzati, tipi delle chiavi del master, riferimenti tra package,
rifiuti e la correzione dei default `sys_fields` descritto in [model.md](model.md).

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r scripts/requirements-parity.txt
ASQUEEL_PYTHON_ROOT=/percorso/asqueel-0.6.1 \
ASQUEEL_MIGRATION_ROOT=/percorso/asqueel-migration \
PYTHON=.venv/bin/python npm run verify:python
```

Servono Node e Bun. Senza variabili, gli script cercano i checkout in `.reference/`;
non usano più implicitamente il repository Python di sviluppo accanto al progetto.
`npm run export:python` rigenera grammatica, costanti, modelli completi ed esempi;
`npm run export:model` rigenera solo il corpus dei modelli. Le fixture non si correggono
a mano. Modificare un riferimento richiede revisionare anche il codice che ne applica
la semantica e aggiornare esplicitamente la provenienza.

## Cosa viene confrontato

`test/model-inputs.json` contiene chiamate dichiarative e contributi, non risultati
risolti. Python e JavaScript li eseguono indipendentemente. Il confronto include
accettazione/rifiuto delle chiamate e della composizione, **tutti** i nodi e attributi
del modello gerarchico, registro delle relazioni completo e JSON migrate.
I casi precedenti di contributi, gruppi, subtables e virtualRelation sono conservati
come scenari aggiornati o verifiche dei rifiuti della 0.6.1; si aggiungono casi specifici
del nuovo contratto. Il corpus comprende configurazione, opzioni, alias e relazioni,
indici, metadati semantici, policy, default SQL, rimappature e casi invalidi.

Ogni caso Python gira in un processo separato per isolare i metadati del framework.
`model_oracle.py` attraversa direttamente il `DbModel`: non usa il vecchio codec dei
descrittori e non ritaglia un sottoinsieme di attributi. Gli indici e le formule
sintetizzati sono confrontati come tutti gli altri nodi. Il test di round-trip importa
lo stesso JSON in JS e verifica che non perda informazioni.

Cinque esempi hanno dichiarazioni scritte separatamente in Python e JS. Sono verificati
anche due stadi di migrazione su SQLite reale, con lettura del catalogo e diff residuo
vuoto. Node, Bun e Chromium eseguono gli stessi confronti; il browser usa fixture,
non un processo Python. L'editor confronta gli esempi originali: modificarli non
rigenera automaticamente il riferimento.

## Query e CRUD: stesso riferimento

`scripts/query_oracle.py` usa `QueryCompiler` e `WriteCompiler` della revisione
0.6.1 + fix #44, fissata anche in `test/fixtures/query-provenance.json`.
I 32 casi base, i 28 casi aggiuntivi, i 32 casi di letture calcolate, i 48 casi
di sottoquery/aggregazioni, i 33 casi callback, i 46 casi macro e i 131 casi PERIOD confrontano il JSON completo dei
sette modelli, il JSON migrate, SQL **esatto**, parametri e risultati SQLite. Le sette ricette hanno
controparti scritte indipendentemente in Python e JS. Il verificatore dal vivo
e la CI eseguono anche questi confronti; il browser usa gli oracoli salvati.

I casi coprono INSERT/UPDATE/DELETE, chiavi composte, default e `sql_value`,
formule/alias semplici, JOIN diretti, aggregazioni, draft/logical deletion e
partizioni con snapshot esplicito. Il corpus aggiuntivo include colonne generate:
il database viene preparato dal DDL prodotto dal migratore Python, perché il
migratore JS additivo ancora le rifiuta. Questo non attesta parità della loro
migrazione. Transazioni e helper record hanno inoltre contratti eseguiti su tutti
e tre gli adapter; non sono un porting completo del runtime applicativo Python.

Rigenerazione degli oracoli query: `PYTHON=.reference/venv-current/bin/python`,
quindi `$PYTHON scripts/query_oracle.py`. Le fixture non vanno modificate a mano.

### Letture calcolate

`examples/read-formulas.js` e `examples/read_formulas.py` dichiarano indipendentemente
tre tabelle per `test/read-inputs.json`. I 32 casi includono il popolamento e
verificano formule annidate, riuso del binding su più clausole, collisioni con i
parametri del chiamante, due JOIN verso la stessa tabella, collezioni locali anche
vuote, stringhe locali simili a riferimenti di campo, `var_kwargs`, `#THIS` e `#ENV`
con fallback, apostrofi, NULL, booleani e sequenze. Le colonne composte sono lette,
filtrate e aggiunte automaticamente come pkey, mantenendo il formato SQL Python
(inclusi i suffissi di tipo e la propagazione dei NULL).

`test/fixtures/reads.json` è generato esclusivamente da Python. Il confronto dal vivo
esegue lo stesso corpus anche con Node e Bun. Il pulsante **Verifica query con Python**
lo esegue su SQLite WASM e ripete tutte le nuove SELECT dopo la riapertura IndexedDB.
Il sorgente del compilatore e dei binding della revisione fissata è stato confrontato
con il tag Python `v0.6.3`: nessuna differenza; il pin dell'oracolo non è cambiato.

Le sottoquery e le aggregazioni inverse/virtuali sono descritte sotto.
Restano da portare altre macro e metodi applicativi `sql_formula_*`/`env_*`.
`#ENV` supporta snapshot JSON scalari e sequenze; oggetti strutturati richiedono
un contratto di conversione e sono rifiutati. La serializzazione SQL delle colonne
composte riproduce Python, senza introdurre un diverso codec JSON.


## Ciclo applicativo sys_fields e hook

`scripts/hooks_oracle.py` esegue le vere API `AsqueelDb`/`SqlTable` del riferimento,
con classi Python indipendenti dal registro di callback JS. 26 scenari confrontano
modello completo/migrate, record mutati (anche in caso di errore), eventi ordinati,
parent delle scritture annidate, SQL/parametri DML e righe SQLite dopo commit/rollback.
Il programma controlla anche che ogni errore previsto si sia realmente verificato.
La CI e `verify:python` rieseguono Python e confrontano Node e Bun; Chromium esegue
gli stessi input e riapre IndexedDB dopo ogni scenario.

Clock e generatore ID sono sostituiti con sorgenti deterministiche **solo nei test**;
le datetime Python vengono rappresentate come stringhe ISO per il confronto con JS.
L'algoritmo ID effettivo è inoltre confrontato con `genro_toolbox.uid.get_uuid` a
parità di timestamp e byte casuali. Gli orologi JS ordinari hanno precisione al
millisecondo, non al microsecondo.

Gli oracoli si rigenerano con `$PYTHON scripts/hooks_oracle.py`.

## Gerarchie e contatori

`examples/hierarchies.py` e `examples/hierarchies.js` dichiarano indipendentemente
lo stesso modello. `scripts/behaviors_oracle.py` esegue 39 scenari sul Python
fissato; `test/behaviors-inputs.json` contiene solo le operazioni, senza algoritmi
condivisi fra Python e JS. Si confrontano JSON completo, JSON migrate, record
mutati, eventi, SQL/parametri DML (incluse le riserve SQLite) e tutte le righe
persistite dopo commit/rollback. `verify:python` rigenera il riferimento in memoria
e lo confronta con fixture, Node e Bun; Chromium esegue gli stessi scenari e
riapre IndexedDB dopo ciascuno.

Il corpus copre rinomina/spostamento/riordino di sottoalberi, genitore e contatore
personalizzati, root_id, ereditarietà, assenza del contatore, archiviazione/ripristino,
radici collegate anche con chiave SQL generata, intervento degli hook, cicli/genitori
inesistenti, contatori invalidi e limite di 1295 fratelli. Include contatori per
scope con NULL, valori espliciti, riuso dopo cancellazione e indici relativi che
sopravvivono alla cancellazione dei dettagli, con rollback del record di estensione.

Rigenerazione: `$PYTHON scripts/behaviors_oracle.py`. I test JS aggiungono richieste
concorrenti sullo stesso adapter e riuso del numero dopo rollback. Non attestano
concorrenza fra più schede browser, crash, audit o codec completi. Le azioni su relazioni composte restano fuori perimetro.


## Cascade applicative onUpdate

`examples/update_cascades.py` e `examples/update-cascades.js` dichiarano lo stesso
modello con API indipendenti. `scripts/cascades_oracle.py` esegue 27 scenari sul
Python fissato: JSON completo/migrate, record e vecchi snapshot, ordine degli hook
con parent del trigger, SQL/parametri DML, dati dopo commit/rollback. Node e Bun
confrontano sia le fixture sia il Python dal vivo; Chromium esegue le stesse
operazioni e riapre IndexedDB dopo ogni caso.

Sono coperti più livelli, più relazioni entranti, prima relazione invariata,
PK modificata, più figli, autorelazioni e un grafo ciclico, NULL, draft/archiviati,
partizioni rispettate o violate, `raise`/`ignore`, errori di unicità e degli hook,
vecchio record assente, record parziale incompleto e mutazione del vecchio snapshot
negli hook. Le FK SQLite con `ON UPDATE CASCADE` sono verificate separatamente:
se hanno già aggiornato i figli, la ricerca applicativa sulla vecchia chiave non
li ritrova e non invoca i loro hook, come Python.

Rigenerazione: `$PYTHON scripts/cascades_oracle.py`. Le fixture non normalizzano
via le scritture o gli eventi dei figli: una cascade svolta soltanto da SQLite
non può passare per una cascade applicativa con hook.

## Sottoquery e aggregazioni inverse

`examples/subqueries.js` e `examples/subqueries.py` definiscono indipendentemente
il corpus `test/subquery-inputs.json`: 48 casi, inclusa la preparazione dei dati,
confrontano modello completo, migrate JSON, SQL esatto, parametri e risultati SQLite.
`test/subquery-errors.json` verifica inoltre 17 rifiuti di compilazione: si confronta
il rifiuto, non il testo localizzato dell'eccezione. Il riferimento resta il commit
0.6.1 + fix #44; compiler, binding, aggregazioni e adapter SQLite sono invariati nel
tag 0.6.3 verificato.

Sono portati `formulaColumn(select=...)`, `exists=...`, i placeholder nominati
`select_*`/`exists_*` e `subQueryColumn(query=..., aggr=...)`. `#THIS` correla al
record proprietario anche attraverso formule e JOIN. Ogni sottoquery ha alias e
parametri locali separati; le formule interne ereditano l'ambiente corretto.
Le policy dei figli seguono Python: di default includono draft e cancellati logici
e ignorano la partizione, salvo opzioni esplicite nella dichiarazione.

Esempio di proiezione:

```js
await queries.table('sq.customer').query({
    columns: '$id,@invoices.aggr(count() AS n,sum($amount) AS total)',
    order_by: '$id'
}).fetch();
```

`aggr()` usa sottoquery correlate: più figli non duplicano il record principale.
Supporta count(), sum/avg/min/max con espressioni e più argomenti, `join` con
separatore/placeholder e `to_json` con valori SQLite nativi. Per join e JSON si
applica l'ordine della tabella figlia o un override esplicito:

```js
columns: "$id,@invoices.order_by('$id DESC').aggr(join($code, ',', '-') AS codes)"
```

Sono coperti insiemi vuoti, NULL, formule e JOIN nei figli, SELECT annidate,
cast/limit/offset, nomi di parametro in conflitto, prefissi di relazioni dirette,
correlazioni composte e `virtualRelation` derivate o dirette con `var_*` come
espressioni del record origine. Tutte le SELECT del corpus sono rieseguite dopo
chiusura e riapertura del database IndexedDB.

Come Python SQLite, il compilatore rifiuta navigazione diretta attraverso relazioni
molti, aggr fuori da una proiezione autonoma, count con argomenti, XML, vecchi mode
JSON/XML delle subQueryColumn e virtualRelation con ask. Le sottoquery accettano
anche riferimenti a callback JS, come descritto sotto. Restano fuori le altre macro
e i JOIN con condizioni personalizzate.


## Callback dinamiche del compilatore

Il registro `methods` tiene le funzioni fuori dal JSON del modello e dal JSON migrate.
I nomi e gli argomenti seguono i metodi Python `SqlTable`:

```js
const methods = {
    'app.owner': {
        sql_formula_scaled(attr) {
            attr.var_factor = this.db.currentEnv.factor ?? 2;
            return '$amount * :factor';
        },
        subquery_total() {
            return {table: 'app.line', columns: 'SUM($amount)',
                where: '$owner_id=#THIS.id'};
        },
        env_label() { return "'owner SQL'"; },
        formulaColumn_extra() {
            return [{name: 'twice', sql_formula: '$amount * 2'}];
        },
    },
};
const query = model.queries(adapter, {methods, environment: {factor: 3}});
const rows = await query.table('app.owner').query({columns: '$scaled,$twice'}).fetch();
```

Le dichiarazioni statiche corrispondenti usano `sql_formula: true`, `select: 'total'`
o `exists: 'total'`, `query: 'total'` nelle `subQueryColumn`, e `#ENV(label)`.
`formulaColumn_*` restituisce una dichiarazione o una lista; i nomi dinamici sono
cercati senza distinzione di maiuscole, come Python, e non entrano nel modello persistito.

`sql_formula_*` riceve una copia degli attributi e può aggiungere `var_*` e
`select_*`/`exists_*`; deve restituire SQL non vuoto. La definizione viene calcolata
una volta per colonna durante una compilazione, anche se raggiunta da più JOIN o
sottoquery. I metodi delle formule e delle colonne dinamiche appartengono alla
tabella della colonna; `subquery_*` appartiene alla tabella della SELECT corrente,
anche quando la formula viene raggiunta attraverso una relazione.

`#ENV` cerca prima la chiave nell'ambiente, poi la chiave alternativa, infine
`env_<nome>()` sulla tabella proprietaria o sulla tabella alternativa. Il risultato
del metodo è un frammento SQL; i valori trovati nell'ambiente sono invece quotati.

Le dichiarazioni `formulaColumn_*` sono memorizzate per oggetto ambiente, come la
cache `currentEnv` Python. Modificare `factor` nello stesso oggetto non rigenera
queste dichiarazioni; un nuovo oggetto ambiente crea una cache distinta. Un provider
`environment: () => ({factor: ...})` produce quindi un ambiente nuovo a ogni chiamata.
Gli attributi delle formule vengono invece ricalcolati a ogni compilazione.

Il contesto JS espone `this.fullname`, `this.name`, `this.db.currentEnv` come copia
locale e `this.db.table(nome)` per chiamare gli altri metodi registrati. Non emula
l'intero `SqlTable` Python: accesso al database, hook di scrittura e stato persistente
vanno gestiti con le API applicative. Le callback sono sincrone; Promise, metodi
mancanti, ritorni invalidi, definizioni in conflitto e cicli vengono rifiutati.
Come per l'API query esistente, `execute`/`fetch` compila al momento dell'esecuzione:
le callback devono essere deterministiche per l'ambiente corrente.

`examples/compiler_callbacks.py` e `examples/compiler-callbacks.js` contengono
ricette e funzioni indipendenti. L'oracolo esegue veri metodi Python associati a
`SqlTable`: 33 casi verificano JSON, SQL, parametri, dati e ordine delle chiamate;
23 casi verificano i rifiuti; tre compilazioni consecutive verificano la cache.
Node, Bun e il worker browser eseguono le funzioni JS, con rilettura SQLite dopo
riapertura IndexedDB. Il browser importa moduli JS: non serializza né valuta codice
ricevuto nel JSON. Il confronto dal vivo rigenera l'oracolo dalla revisione Python fissata.


## Macro TEMPLATE e IN_RANGE

`#TEMPLATE` è espansa in colonne, WHERE, ORDER BY, GROUP BY, HAVING e formule,
anche quando la formula viene restituita da una callback. L'output SQLite usa
`COALESCE(CAST(... AS TEXT), '')` e concatenazioni `||`, esattamente come Python:
un valore NULL contribuisce testo vuoto. I placeholder sono nominati, possono
ripetersi e accettano nomi Unicode. `$$` indica il dollaro letterale e `''` un
apostrofo all'interno del template SQL.

```js
const rows = await query.table('app.person').query({
    columns: "#TEMPLATE('${n} (${c})', $name AS n, @city_id.name AS c) AS label",
    where: '#IN_RANGE($amount,:low,:high)',
    sqlparams: {low: 10, high: 20},
}).fetch();
```

`#IN_RANGE` è espansa nel WHERE e nelle formule. Gli estremi sono inclusivi;
`null` elimina il relativo limite. Con entrambi gli estremi assenti il predicato
è vero anche per un valore NULL; con almeno un estremo presente un valore NULL
mantiene la logica SQL a tre valori e viene escluso dal WHERE. Un intervallo
invertito non seleziona righe. Operandi e contesti ammessi seguono la grammatica
Python: campi, riferimenti a relazioni, parametri e identificatori semplici,
non espressioni arbitrarie come `$amount + 1` dentro la macro.

Il confronto usa `examples/query_macros.py` e `examples/query-macros.js`, scritti
indipendentemente: 46 casi eseguono SQL su SQLite e confrontano modello completo,
JSON migrate, SQL esatto, parametri e risultati. Coprono NULL, quoting, Unicode,
parametri, formule composte, relazioni, aggregazioni, sottoquery, filtri e conteggi.
Altri due casi nel corpus callback verificano entrambe le macro generate da metodi.
18 usi non validi sono rifiutati come Python: argomenti mancanti, duplicati o non
usati, sintassi incompleta, template direttamente annidati e IN_RANGE fuori dai
contesti ammessi. Come Python, anche un marcatore non risolto come `#tag` nel
testo letterale del template viene rifiutato. Il browser riesegue tutte le SELECT dopo riapertura IndexedDB.

Il porting conserva l'ordine di espansione Python. I template direttamente annidati
negli argomenti sono rifiutati dal riferimento; le formule che richiamano altre
formule contenenti template sono invece supportate. `#BAG/#BAGCOLS` restano incrementi separati.


## PERIOD e parser delle date naturali

Il compiler espande `#PERIOD(campo,parametro)` nel WHERE, anche nelle SELECT
correlate delle formule. La lettura del testo usa il parser pubblico di Gramlot,
registrato una volta nel runtime. Il core Asqueel non importa Gramlot e non
mantiene un secondo parser. Lo stesso collegamento funziona in Node, Bun e worker:

```js
import {parseDateExpression} from '@gramlot/gramlot';

const queries = model.queries(adapter, {
    parseDateExpression,
    environment: {locale: 'it-IT', workdate: '2026-10-21'},
});
const rows = await queries.table('period.event').query({
    columns: '$id,$issued',
    where: '#PERIOD($issued,period)',
    sqlparams: {period: 'mese scorso'},
}).fetch();
// WHERE (t0."issued" BETWEEN :period_from AND :period_to)
// period_from: '2026-09-01', period_to: '2026-09-30'
```

Entrambi i valori `locale` e `workdate` sono obbligatori, come nel riferimento
Python. In JS workdate è una data civile ISO `YYYY-MM-DD`, senza conversioni di
fuso orario. Il risultato del parser sincrono è `{ok:true,kind:'date',date}` oppure
`{ok:true,kind:'period',start,end}`; gli estremi aperti sono `null`.
I parametri Python di tipo `date` sono normalizzati a ISO per confrontarli con
le stringhe JS e passarli a SQLite. Il testo originale resta tra i parametri
compilati, come Python; l'adapter inoltra solo quelli effettivamente usati dal SQL.

Sono confrontati italiano e inglese, varianti regionali, oggi/ieri/domani,
settimane, mesi, trimestri, anni, spostamenti e intervalli aperti. Un solo giorno
produce `=`, due estremi diversi `BETWEEN`, un estremo solo `>=` o `<=`, il periodo
vuoto `true`. Il compiler sostituisce le virgole con `;` prima del parser, proprio
come Python: alcune espressioni accettate dal parser diretto non lo sono in PERIOD.
Le macro ripetute condividono i parametri nello stesso SELECT; sottoquery e formule
rispettano i namespace e le collisioni del compiler Python. Ogni compilazione
rilegge l'ambiente; `env_period` può prelevare il testo dall'ambiente.

Il riferimento controllato usa Toolbox 0.18.0 e il parser Gramlot 0.3.8 già
installato. Due ricette indipendenti producono modello e JSON migrate identici;
131 casi confrontano SQL, parametri e righe, 27 verificano i rifiuti. Gli stessi
casi sono eseguiti nel worker e riletti dopo riapertura IndexedDB. Il playground
collega il parser anche alla preview e alle query personalizzate dell'editor.

Senza il servizio `parseDateExpression`, una query PERIOD fallisce esplicitamente;
le altre query continuano a funzionare. PERIOD non è una macro generica utilizzabile
in colonne, ORDER BY o `sql_formula`: segue i contesti ammessi da Python. Una formula
può però dichiarare una SELECT con PERIOD nel suo WHERE. Restano da portare le
macro Bag e i metadati dei risultati.


## Importazione CSV, JSON e TYTX

49 scenari aggiuntivi confrontano le chiamate reali a `SqlTable.sql_insert` con
l'API JS: modello/migrate, SQL degli INSERT, parametri passati a SQLite, righe,
assenza di trigger, adattamento personalizzato e rollback. Le due dichiarazioni
sono indipendenti (`examples/import_records.py` e `examples/import-records.js`).
Il corpus usa blocchi oltre le 1.000 righe, file malformati, duplicati e fallimenti
dopo un blocco già scritto. Il browser confronta gli stessi risultati e riapre
IndexedDB. I limiti e il contratto delle transazioni sono in [Importazione](import.md).

## Trasferimento della sorgente e degli snapshot

`scripts/transfer_oracle.py` esporta una SourceBag Python TYTX, con modello
completo, selezioni per package/tabelle, modello senza dati, colgroups,
virtualRelation e sys_fields (compresi package vuoti richiesti). Le otto prove
confrontano modello completo, migrate JSON, catalogo SQLite e valori fisici.
I casi con dati modificano un documento e inseriscono una riga offline;
verificano anche NULL con default SQL, booleani, decimali, Unicode, nomi SQL
personalizzati, testo con suffissi TYTX e date con offset/microsecondi.
La precisione delle date è confrontata anche con i valori Python originali,
prima della serializzazione. Selezioni sconosciute, dipendenze mancanti e
collisioni di nomi SQL sono rifiutate.

Node e Bun inviano i bundle esportati al ricevitore Python su un database nuovo.
I test Playwright fanno lo stesso lavoro in SQLite WASM, riaprono IndexedDB e
salvano **gli effettivi bundle del browser** in `output/browser-transfer-returns.json`.
`verify_transfers.py --browser output/browser-transfer-returns.json` li carica
con Python e verifica anche i tipi TYTX decodificati. Non è un confronto simulato
né un servizio di sincronizzazione. API e limiti: [Trasferimenti](transfers.md).


La prova `bags_blobs` confronta Bag annidate (etichette, tag, ordine, attributi,
Decimal, date con offset/microsecondi, oggetti/liste JSON e byte) e blob contenenti
ogni valore 0–255. Distingue Bag vuota, blob vuoto e NULL. Crea una nuova Bag e
modifica un blob nel browser prima di esportarli; verifica i buffer Uint8Array
con offset e la proprietà dei byte restituiti dall’adapter. Otto input non validi
sono rifiutati da Python e JS con rollback dei record precedenti, anche su WASM.
Il database di staging conserva le Bag in TYTX: il confronto riguarda il valore
tipizzato, non la formattazione XML del writer applicativo Python.
