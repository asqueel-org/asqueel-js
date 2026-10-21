# Confronto con Python 0.6.1

`test/fixtures/provenance.json` fissa core **0.6.1 + fix #44 / 8a8ffd3**, migration **0.3.1**
e genro-builders **0.29.0**. La CI fa checkout di quei commit, senza seguire `main`.
Il verificatore rifiuta un checkout Python di un'altra versione.

Il riferimento include la correzione Python della [issue #44](https://github.com/asqueel-org/asqueel/issues/44), successiva alla release pubblicata v0.6.1.
I 218 casi includono 14 regressioni aggiunte per gerarchie collegate, contatori e
parent personalizzati, tipi delle chiavi del master, riferimenti tra package,
rifiuti e la correzione dei default `sys_fields` descritto in [model.md](model.md).

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

## Query e CRUD: stesso riferimento

`scripts/query_oracle.py` usa `QueryCompiler` e `WriteCompiler` della revisione
0.6.1 + fix #44, fissata anche in `test/fixtures/query-provenance.json`.
I 32 casi base e i 28 casi aggiuntivi confrontano il JSON completo dei due modelli,
il JSON migrate, SQL **esatto**, parametri e risultati SQLite. Le due ricette hanno
controparti scritte indipendentemente in Python e JS. Il verificatore dal vivo
e la CI eseguono anche questi confronti; il browser usa gli oracoli salvati.

I casi coprono INSERT/UPDATE/DELETE, chiavi composte, default e `sql_value`,
formule/alias semplici, JOIN diretti, aggregazioni, draft/logical deletion e
partizioni con snapshot esplicito. Il corpus aggiuntivo include colonne generate:
il database viene preparato dal DDL prodotto dal migratore Python, perché il
migratore JS additivo ancora le rifiuta. Questo non attesta parità della loro
migrazione. Transazioni e helper record hanno inoltre contratti eseguiti su tutti
e tre gli adapter; non sono un porting completo del runtime applicativo Python.

Rigenerazione degli oracoli query: `PYTHON=.reference/venv-current/bin/python`,
quindi `$PYTHON scripts/query_oracle.py`. Le fixture non vanno modificate a mano.
