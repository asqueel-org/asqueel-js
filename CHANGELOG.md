# Changelog

## Non rilasciato

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
