# Changelog

## 0.1.1 — 2026-10-21

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
