# Confronto con Python 0.6.1

`test/fixtures/provenance.json` fissa core **0.6.1 / 210e0ce**, migration **0.3.1**
e genro-builders **0.29.0**. La CI fa checkout di quei commit, senza seguire `main`.
Il verificatore rifiuta un checkout Python di un'altra versione.

La release verificata è [v0.6.1](https://github.com/asqueel-org/asqueel/releases/tag/v0.6.1).
I 218 casi includono 14 regressioni aggiunte per gerarchie collegate, contatori e
parent personalizzati, tipi delle chiavi del master, riferimenti tra package,
rifiuti e il difetto residuo dei default `sys_fields` descritto in [model.md](model.md).

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

## Query: provenienza distinta

Le 18 fixture SQL/query restano test di regressione del compilatore precedente,
con provenienza in `test/fixtures/query-provenance.json`. **Non attestano parità delle
query con Python 0.6.1.** L'oracolo query storico è conservato come ricetta per il
prossimo porting e non è chiamato dall'export o dalla CI di parità del modello.
Le query non sono state ampliate in questa fase; usano una vista del nuovo modello.
