# Unificazione con Python 0.7.0

Parte della release di consolidamento 0.2.0; vedere [perimetro e verifiche](consolidation.md).

Ricette e JSON ufficiale producono lo stesso `DbModel`. Query, scritture,
transazioni, hook, importazioni e cascata condividono il modello; le viste del
compilatore leggono i suoi attributi. `SqliteQueries.model` espone questa istanza
al posto del precedente riferimento alla ricetta in `SqliteQueries.builder`.
Il codec di confronto Python separato è stato rimosso.

## Compatibilità e pubblicazione

Il formato `asqueel-model` è ora versione 2. I precedenti JSON del modello
vanno riesportati dalla ricetta; non viene mantenuto un secondo caricatore.
Il riferimento Python deve essere disponibile sul remote prima della CI di
parità. Tag e pubblicazione PyPI/npm non sono stati eseguiti.
