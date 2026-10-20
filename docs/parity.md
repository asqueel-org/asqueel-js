# Confronto con Python

Ci sono due verifiche distinte:

- `npm test`, Bun e Chromium confrontano gli oracoli Python salvati nel repository.
- `npm run verify:python` esegue Python e JavaScript sugli stessi casi e confronta
  modello, catalogo reale, SQL, parametri e righe restituite da SQLite.

Il browser non avvia Python: gli oracoli servono a verificare gli esempi originali.
Modificare l'esempio nell'editor non produce automaticamente un nuovo riferimento.

## Riferimento riproducibile

Le revisioni sono in [`test/fixtures/provenance.json`](../test/fixtures/provenance.json).
La CI le legge ed esegue checkout separati in `.reference/`, senza seguire `main`.
Questo evita che un cambiamento Python renda instabile una revisione JS invariata.

Per replicare localmente, clonare `asqueel-org/asqueel` e
`asqueel-org/asqueel-migration`, fare checkout dei commit indicati e preparare
un ambiente Python 3.12:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r scripts/requirements-parity.txt
ASQUEEL_PYTHON_ROOT=/percorso/asqueel \
ASQUEEL_MIGRATION_ROOT=/percorso/asqueel-migration \
PYTHON=.venv/bin/python npm run verify:python
```

Servono anche Node e Bun: il verificatore confronta entrambi. I riferimenti
Python sono caricati dai rispettivi `src/`, senza installare i package Asqueel.
Se le variabili sono omesse, gli script cercano `../asqueel` e
`../asqueel-migration`. Per confronti esplorativi è possibile usare working tree
modificati, ma questi non costituiscono un riferimento riproducibile.

## Aggiornare il contratto

1. Scegliere revisioni Python pulite e leggere le modifiche di comportamento.
2. Aggiornare le dipendenze del verificatore se richiesto da quelle revisioni.
3. Eseguire `npm run export:python` con le variabili di riferimento sopra.
4. Revisionare insieme grammatica, costanti, fixture e `provenance.json`.
5. Eseguire Node, Bun, Chromium e parità dal vivo; non correggere le fixture a mano.

L'export completo registra gli hash dei checkout Git. Le fixture migrate dal PoC
mantengono la provenienza originale; lo spostamento in questo repo non le rigenera.

La parità iniziale copre 55 modelli, due stadi di migrazione e 18 richieste query.
È un insieme esplicito di casi, non una certificazione dell'intera API Python.
Per comportamenti non deterministici servono clock, utente e generatore ID
controllabili: non basta confrontare il solo testo SQL.
