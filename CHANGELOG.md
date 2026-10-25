# Changelog

## Non rilasciato — parità con Python asqueel f5185ad

- Riferimento Python: asqueel 0.7.0 al commit f5185ad (main dopo la 0.7.0 con il
  salvataggio della ricetta in TYTX), asqueel-migration 0.3.5, genro-builders 0.30.0,
  genro-bag 0.28.0, genro-tytx 0.16.4. Il riferimento precedente, 02ca1e7, era un
  commit intermedio della 0.7.0.
- Grammatica rigenerata da Python. Opzioni con i nomi legacy: `sysFields`, `counter`,
  `relidx`, `df`, `fullUpd`, `sysrecords`; colonna `readOnly`.
  `relation(related_column, ..., insensitive=)` sostituisce `to` e `case_insensitive`.
- Escono dalla grammatica `schemas`/`schema`, `weak_relation`, `validation`,
  `encryption` e le opzioni `record_hash`, `audit`, `protection`, `attachments`.
  Un modello parte solo da `packages().package(...)`; una pkey composta nomina la
  sua `compositeColumn`.
- Nessun attributo `x_*` nel source e nel modello. Una relazione senza foreign key
  indicizza le sue colonne; i campi gerarchici e le colonne copiate dal padre
  derivano dall'opzione `hierarchical`.
- La grammatica controlla `retention.days >= 0`, `hierarchical.depth >= 1`, i timeout
  del driver `>= 0` e `package.sqlprefix`; `column` dichiara i sei parametri
  `sql_pg_*`/`sql_sqlite_*`.
- Il JSON migrate è prodotto dal source preparato, come `SqlMigrationRenderer`
  Python. La costruzione del modello controlla le impostazioni di connessione
  come `AsqueelDb`. Le colonne `formulaColumn_<x>()` sono costruite alla prima
  lettura delle colonne virtuali, anche nelle scritture.
- `SqlSourceBag` è registrato come sottotipo TYTX con il nome Python;
  `recipe.toTytx()` e `SqlBuilder.fromTytx()` salvano e ricaricano la ricetta.
- `#PERIOD` decodifica le date naturali con `parseDateExpression` di
  `@genrojs/toolbox` (>=0.19.0), come Python con `genro_toolbox.dates`. L'opzione
  runtime `parseDateExpression` è rimossa: `queries(adapter, {parseDateExpression})`
  solleva un errore.
- Rimossi `toJSON()`, `DbModel.fromJSON()`, `modelToJSON` e `modelFromJSON`: il
  JSON del modello non esiste più in Python. I confronti usano il source composto
  in TYTX e il JSON migrate.

## 0.2.0 — Candidato di consolidamento

- Riuniti i porting già presenti su main, l'export HTML e la demo assemblea offline:
  86 operazioni confrontate con Python, upgrade dei workspace, verbali e interfaccia
  aggiornata. Il formato del modello diventa quello ufficiale Python v2.
- Parità aggiornata al consolidamento Python 0.7.0: stringhe, identificatori e
  commenti SQL non generano parametri; scope formula, collezioni e parametri
  adiacenti seguono lo stesso comportamento.

- Export Gramlot in un unico HTML apribile con `file://`, con worker e SQLite WASM
  incorporati. Caricamento modello/dati, CRUD, riavvio Chromium senza rete ed export
  confrontato con Python; persistenza Bag/blob e isolamento dei workspace per percorso.
  L'adapter browser accetta opzionalmente i byte WASM senza fetch esterno.

- Unificazione con Python 0.7.0: formato `asqueel-model` versione 2 e codec
  ufficiale come unico riferimento. Il formato precedente richiede una nuova
  esportazione dalla ricetta.
- Modello JSON direttamente eseguibile con `model.queries(adapter)`. Ricette,
  transazioni, hook, importazioni e cascata usano la stessa istanza del modello;
  le viste del compilatore non copiano gli attributi semantici.
- Parità completa dei corpus esistenti aggiornata al commit Python 02ca1e7,
  compresa la rilettura in Python dei modelli prodotti da Node e Bun.

- Ciclo offline completo nel playground: cache versionata di app/Gramlot/WASM,
  workspace persistente con Bag sorgente, editor CRUD sul modello caricato e
  ripristino alla riapertura. Test con rete disabilitata e riavvio di Chromium,
  esportazione reale e confronto Python di modello, migrate, struttura e valori.

- Campi Bag (X) e blob (O) negli snapshot Python/browser/Python. Bag statiche
  annidate con tag, attributi e valori TYTX precisi; blob confrontati byte per byte,
  inclusi vuoti e NULL. Verifica di modifiche nel browser e ritorno Python.
  Corretti nell’adapter WASM il binding del blob vuoto e la copia dei risultati
  binari dalla memoria SQLite prima del prossimo step/finalize.

- Trasferimento Python → browser → Python: vera SourceBag TYTX completa o
  selezionata per package/tabelle, snapshot di record TYTX, caricamento atomico
  con NULL espliciti e export dal database locale. Confronto del modello completo,
  migrate, catalogo e valori su Node, Bun e SQLite WASM/IndexedDB; ricevitore
  Python verificato sui bundle restituiti dal browser. Pagina Gramlot dedicata;
  nessun motore di sincronizzazione.

- Import CSV/JSON/TYTX tramite `table.sql_insert`, con lettura incrementale,
  blocchi di 1.000 record, adattamento dal modello e chiavi automatiche.
  Semantica SQL diretta senza trigger, come Python, e transazioni atomiche JS.
  49 scenari confrontano SQL, parametri e dati Python anche nel worker browser,
  con rollback e riapertura IndexedDB; selettore di file nel playground Gramlot.

- #PERIOD nel WHERE e nelle sottoquery, con parser pubblico Gramlot fornito al
  runtime, senza duplicare le routine delle date naturali. 131 casi e 27 rifiuti
  confrontano modello/migrate, SQL, parametri e risultati Python; esecuzione anche
  su SQLite WASM e rilettura dopo riapertura IndexedDB. Date civili ISO, locale e
  workdate espliciti; nessuna dipendenza Gramlot nel core.

- Macro #TEMPLATE e #IN_RANGE portate dal compiler Python, con concatenazione
  SQLite compatibile con NULL, nomi Unicode e intervalli inclusivi/aperti.
  46 casi dedicati e due casi callback confrontano SQL, parametri e risultati;
  18 usi non validi sono rifiutati come Python. Verificati anche su WASM e dopo
  riapertura IndexedDB.

- Callback sincrone del compilatore (`sql_formula_*`, `subquery_*`, `env_*`,
  `formulaColumn_*`) nel registro runtime `methods`, con risoluzione del proprietario,
  attributi locali e cache per ambiente allineati a Python. 31 nuovi casi verificano
  modello/migrate, SQL, parametri, chiamate e dati; 23 errori e il ciclo cache sono
  confrontati con Python anche su SQLite WASM e dopo riapertura IndexedDB.

- Sottoquery scalari ed EXISTS, select_*/exists_* nelle formule, subQueryColumn
  dichiarative e aggregazioni inverse/virtuali `aggr()` (count/sum/avg/min/max,
  join ordinato e to_json). Scope dei parametri e alias SQL allineati a Python,
  anche con formule correlate, annidamenti e chiavi composte. 48 casi indipendenti
  e 17 rifiuti confrontati su Node, Bun e SQLite WASM, con riapertura IndexedDB.

- Compilatore di lettura: formule annidate con parametri locali `var_*`/`var_kwargs`,
  `#THIS`, `#ENV` da snapshot e lettura delle colonne composte, anche come pkey
  automatica. Ordine dei binding e collisioni allineati a Python; 32 nuovi casi
  confrontano modello/migrate, SQL esatto, parametri e risultati su SQLite reale,
  inclusa la riapertura di IndexedDB nel browser.

- Cascade applicative `onUpdate` su relazioni fisiche (`cascade`, `raise`, `ignore`):
  aggiornamenti a catena, hook dei figli prima dell'after-hook del padre,
  policy di partizione e rollback atomico. 27 scenari confrontati con Python
  anche su SQLite WASM/IndexedDB, con pulsante dedicato nel playground.

- Gerarchie e contatori automatici nel ciclo applicativo: percorsi, spostamenti,
  riordino, ereditarietà, radici collegate, cancellazione/archiviazione dei discendenti,
  `auto_counter` e `relative_index`. 39 scenari confrontati con Python, anche nel
  browser con riapertura IndexedDB; pulsante dedicato nella pagina Query.
- Binding SQLite degli interi coerente tra Node, Bun e browser: evita percorsi
  testuali come `1.0/1` al posto di `1/1`.

- Ciclo applicativo `table.insert/update/delete`: sys_fields, ID legacy22,
  timestamp/utente, default, campi protetti e hook JS asincroni con rollback atomico
  anche delle scritture annidate. 26 confronti indipendenti con Python.
- Verifica dedicata sys_fields/hook nel playground, con eventi, SQL e dati
  persistiti controllati dopo riapertura di IndexedDB.
- Playground allineato alla gallery Gramlot: temi Base/Compact/Index, barra compatta,
  colori e spaziature condivisi, CodeMirror coerente con il tema.
- Compilatori SELECT/CRUD allineati a Python 0.6.1 + fix #44, con 60 confronti
  di modello completo, migrate JSON, SQL, parametri e risultati SQLite.
- UPDATE/DELETE, aggregazioni, formule/alias semplici, chiavi composte, policy
  e transazioni atomiche; helper `fetchRecord`, `count`, `exists`.
- Cambiamento API del PoC: `insert`/`update` restituiscono il record arricchito dai
  default SQL; `returning` esplicito è ritirato a favore del comportamento Python.
  Parametri assenti diventano NULL, `limit: 0` non limita i risultati.

## 0.1.1 — 2026-10-21

- Rimozione dei limiti superiori sui tool Genro e Gramlot; tutte le suite CI
  aggiornano i tool interni alle ultime versioni pubblicate.

- Pubblicazione npm automatica dai tag GitHub tramite Trusted Publishing OIDC,
  con verifica del tarball installato e del pacchetto scaricato dal registry.
- Riutilizzo della CI sul commit integrato, evitando suite duplicate sui tag
  e sui push dei branch di lavoro. Nessuna modifica alle API runtime.

## 0.1.0 — 2026-10-21

- Prima distribuzione npm pubblica di `@asqueel/asqueel-js`, con entry point ESM per
  modello, migrazioni SQLite e adapter Node, Bun e browser.
- Modelli gerarchici e migrazioni confrontati con il riferimento Python fissato,
  inclusa la correzione della precedenza di `indexed=False` nei campi di sistema.
- Package sperimentale: parità completa delle query, comportamenti applicativi
  Python, API worker riusabile e caricamento offline restano fuori da questa release.
