# Consolidamento e unificazione 0.2.0

Il candidato riunisce i porting già presenti su main, l’HTML autonomo e il lavoro
locale sulla demo assemblea con l’unificazione del modello. Riferimento Python
0.7.0: commit `02ca1e7c8a66dc9140bc76baf3185c1283cae9f8`, verificato prima del porting JS.
Include la correzione dei binding SQL (#35), il modello JSON ufficiale v2 e
l’esecuzione sulla stessa istanza `DbModel`.

Le fixture assemblea v1–v4 restano nei test degli upgrade dei bundle SourceBag.
I vecchi JSON del modello v1 devono invece essere riesportati dalla ricetta.
Safari e dispositivi fisici restano fuori dalla qualificazione automatica.
DB Manager è fuori perimetro. I candidati precedenti non vanno pubblicati.

Verifiche del candidato combinato:

- 942 test Node e 942 Bun, senza errori.
- 29 scenari browser, 2 HTML autonomi e 8 assemblea, inclusi upgrade dei
  workspace v1–v4 e riavvio offline.
- Parità live: 218 casi strutturali, 5 esempi, 2 migrazioni SQLite, 352 query/CRUD,
  26 cicli hook, 39 gerarchie/contatori, 27 cascade, 49 import e 86 azioni assemblea.
- I JSON prodotti da Node e Bun sono riletti dal codec Python ufficiale;
  i bundle effettivamente esportati dal browser vengono reimportati da Python.

La pubblicazione richiede ancora il commit Python remoto e la CI. Le prove
consumer del tarball finale e i checksum sono registrati nell’audit di release.
