# Changelog

## Non rilasciato

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
