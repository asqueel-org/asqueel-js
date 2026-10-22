# Consolidamento 0.2.0

Il candidato riunisce i 15 commit presenti su main dopo v0.1.1, il commit locale
`a9a140a` sull'HTML autonomo e il lavoro locale sulla demo assemblea. Include anche
la correzione Python 0.6.4 dei binding SQL, portata nella gestione dei parametri JS.
Non include il nuovo formato modello v2 né modifica il formato dei bundle esportati.

Verifiche del 22 ottobre 2026:

- 940 test Node e 940 Bun.
- 29 scenari browser, 2 HTML autonomi e 8 assemblea offline. Un'asserzione sul
  conteggio query è stata aggiornata da 350 a 352; lo scenario è poi passato.
- Parità live contro il commit Python 31ca251: 218 casi strutturali,
  204 modelli completi, 201 documenti migration, 5 esempi indipendenti,
  2 migrazioni SQLite, 352 query/CRUD, 26 cicli hook, 39 gerarchie/contatori,
  27 cascade, 49 import e 86 azioni della demo assemblea.
- Tarball installato in una directory vuota: import pubblici, migrazione,
  34 casi SQL/CRUD Python e seconda migrazione su Node e Bun.

Le vecchie fixture assemblea v1–v4 restano nei test degli upgrade. Le bozze non
salvate non diventano persistenti implicitamente. Safari e dispositivi fisici
restano fuori dalla qualificazione automatica di questa release.

Il candidato precedente nel worktree `unified-model-js`, anch'esso marcato 0.2.0,
è superato e non deve essere pubblicato. Dopo questo consolidamento il lavoro di
unificazione va aggiornato sulla nuova base e deve usare una versione successiva.
