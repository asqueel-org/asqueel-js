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

Verifiche combinate in corso: Node, Bun, browser, HTML autonomi, assemblea,
parità Python e installazione del tarball in un progetto vuoto.
