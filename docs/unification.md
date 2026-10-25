# Unificazione del modello

Parte della release di consolidamento 0.2.0; vedere [perimetro e verifiche](consolidation.md).

Ricette e source salvati in TYTX producono lo stesso `DbModel`. Query, scritture,
transazioni, hook, importazioni e cascata condividono il modello; le viste del
compilatore leggono i suoi attributi. `SqliteQueries.model` espone questa istanza.

## Formato salvato

Il formato salvato è il source della ricetta in TYTX (`SqlSourceBag`), lo stesso di
Python `recipe.source.to_tytx()`. Il JSON del modello risolto (`asqueel-model`
versione 2) è stato rimosso insieme al codec Python: i JSON salvati in quel formato
vanno riesportati dalla ricetta. Non viene mantenuto un secondo caricatore.
Tag e pubblicazione PyPI/npm non sono stati eseguiti.
