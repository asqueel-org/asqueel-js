# Pubblicare Asqueel JS

Package npm pubblico: `@asqueel/js`. Prima versione: `0.1.0`.
La serie 0.1.x è sperimentale; non dichiara parità completa con Python.
La provenienza del confronto del modello rimane fissata in
`test/fixtures/provenance.json`, indipendentemente dalla versione npm.

## Preparazione

1. Aggiornare insieme `package.json`, il lockfile e le note di rilascio.
2. Verificare `npm run check`, `npm run test:bun` e i controlli CI, inclusi browser
   e parità Python. Se cambia solo il packaging, verificare soprattutto il tarball.
3. Eseguire `npm pack` e controllare la lista dei file: sorgenti, grammatica,
   documentazione e licenze; niente credenziali, database o file del playground.
4. Installare il tarball in una directory vuota. Verificare gli import pubblici,
   una migrazione SQLite, insert/select e una seconda migrazione su Node e Bun.
   Verificare anche il bundle dell'entry point browser dal pacchetto installato.

## Pubblicazione

Serve un account npm autorizzato allo scope `@asqueel`, con autenticazione
richiesta da npm. Usare `npm login` senza salvare token nel repository.
Controllare `npm whoami` e `npm view @asqueel/js versions --json` prima di scegliere
la versione. Una versione pubblicata non può essere sovrascritta.

Dopo il merge del commit verificato, creare il tag `v0.1.0` e pubblicare lo stesso
archivio verificato:

```sh
npm publish /percorso/asqueel-js-0.1.0.tgz --access public
```

Verificare la versione nel registry e installarla in una nuova directory, ripetendo
lo smoke test SQLite. Creare la GitHub Release dallo stesso tag. Per ora la
pubblicazione è esplicita; la CI dei test non pubblica automaticamente su npm.

## Browser

Il package distribuisce moduli ESM, non il playground compilato. Il consumatore
bundla il proprio worker e copia `wa-sqlite/dist/wa-sqlite-async.wasm` accanto al
bundle. Vedere
`docs/architecture.md` e l'esempio browser nel repository.
