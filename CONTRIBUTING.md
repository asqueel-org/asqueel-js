# Sviluppare Asqueel JS

La priorità è un'app locale funzionante: completare una capacità per tutto il
percorso, invece di accettare nuove dichiarazioni senza implementarne gli effetti.

1. Definire il caso e il comportamento Python di riferimento.
2. Aggiungere un modello/esempio Python indipendente quando serve un nuovo oracolo.
3. Portare la capacità riusando risoluzione e contratto adapter esistenti.
4. Verificare SQL e parametri, esecuzione, effetti e rollback applicabili.
5. Aggiornare copertura e roadmap solo dopo la verifica.

Non modificare a mano `src/generated/` o `test/fixtures/` per far passare un test:
usare gli exporter e controllare le differenze. La procedura è in
[docs/parity.md](docs/parity.md). Non copiare codice JS dentro l'oracolo Python.

## Verifiche locali

```sh
npm ci
npm run check
npm run test:bun
npx playwright install chromium
npm run test:browser
```

Per modifiche al resolver, compilatore o migratore eseguire anche la parità
Python dal vivo. Testare sui driver reali: la sola uguaglianza del SQL non basta.
I test browser usano database temporanei propri e non devono cancellare dati
applicativi. Non committare `node_modules`, bundle, database o output dei test.

## Scelte iniziali

- ESM JavaScript; dichiarazioni TypeScript quando il contratto pubblico si stabilizza.
- Un package, con export separati per i driver dei tre runtime.
- Dipendenze e lockfile rivisti insieme; nessun processo Python a runtime.
- Le funzionalità non supportate producono errori espliciti prima delle scritture.
- Nessuna pubblicazione automatica npm finché i criteri della prima release
  non sono completati; il package rimane `private: true`.

Il playground esegue codice del suo editor: è uno strumento di sviluppo locale,
non una sandbox per eseguire codice di utenti non fidati.
