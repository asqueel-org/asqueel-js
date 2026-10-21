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
npm run update:tools
npm run check
npm run test:bun
npx playwright install chromium
npm run test:browser
```

Per modifiche al resolver, compilatore o migratore eseguire anche la parità
Python dal vivo. Testare sui driver reali: la sola uguaglianza del SQL non basta.
I test browser usano database temporanei propri e non devono cancellare dati
applicativi. Non committare `node_modules`, bundle, database o output dei test.

## Dipendenze interne

I tool Genro e Gramlot hanno soltanto una versione minima: non aggiungere limiti
superiori per nascondere regressioni. La CI esegue tutte le suite dopo
`npm run update:tools`, aggiornando anche Bag e TYTX transitivi dal registry.
Il lockfile resta utile per riprodurre una verifica; `npm ci` da solo non verifica
la compatibilità con gli ultimi tool. Anche la parità Python usa le ultime
dipendenze Genro pubblicate, mantenendo i commit di riferimento degli oracoli.
Le incompatibilità vanno corrette invece di ripristinare vecchi vincoli.

## Scelte iniziali

Per il playground seguire la guida Gramlot
[Writing pages (GC-095)](https://github.com/gramlot-org/gramlot/blob/main/docs/public/095-writing-pages.md).
Nel workspace dell'autore il riferimento è
`/Users/gporcari/Sviluppo/gramlot/gramlot/docs/public/095-writing-pages.md`.
Usare `Page.main` per Source, `Logic` nominata, `node.GET/SET` per Data,
binding `value='^path'` (con `live: true` per gli input nativi) e `button` con
`dataController` per le azioni. `html_button` è per comportamento HTML nativo;
non esegue controller figli. Verificare sempre le API sull’ultima versione npm pubblicata:
la guida distingue esplicitamente il contratto di sviluppo da quello pubblicato.

- ESM JavaScript; dichiarazioni TypeScript quando il contratto pubblico si stabilizza.
- Un package, con export separati per i driver dei tre runtime.
- Dipendenze e lockfile rivisti insieme; nessun processo Python a runtime.
- Le funzionalità non supportate producono errori espliciti prima delle scritture.
- Pubblicazioni automatiche dai tag verificati: seguire
  [RELEASING.md](RELEASING.md). La serie 0.1.x resta sperimentale.

Il playground esegue codice del suo editor: è uno strumento di sviluppo locale,
non una sandbox per eseguire codice di utenti non fidati.
