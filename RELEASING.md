# Pubblicare Asqueel JS

Package npm pubblico: `@asqueel/asqueel-js`. Candidato di consolidamento: `0.2.0`.
La serie 0.x è sperimentale; non dichiara parità completa con Python.
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

## Collegamento iniziale npm / GitHub (una sola volta)

Nelle impostazioni npm di `@asqueel/asqueel-js`, sezione **Trusted Publisher**,
aggiungere GitHub Actions con questi valori esatti:

| Campo | Valore |
|---|---|
| Organization or user | `asqueel-org` |
| Repository | `asqueel-js` |
| Workflow filename | `publish.yml` |
| Environment name | `release` |
| Allowed actions | **Allow npm publish** |

Il solo permesso `npm stage publish` richiederebbe ancora una conferma manuale
per ogni release. Non servono `NPM_TOKEN` o `NODE_AUTH_TOKEN`: il workflow usa
OIDC su runner GitHub, Node 24 e npm 11.21.0. La prima pubblicazione deve avvenire
entro due giorni dalla creazione del collegamento, altrimenti npm lo fa scadere.
Vedere la [documentazione npm](https://docs.npmjs.com/trusted-publishers/).

## Rilasci successivi

1. Aggiornare versione, lockfile e changelog; integrare la PR con CI verde.
2. Creare e inviare il tag `v<versione>` sul commit integrato di `main`.
3. Attendere il workflow **Build and publish npm package**.

```sh
git tag -a v0.1.1 <commit-integrato> -m "Asqueel JS 0.1.1"
git push origin v0.1.1
```

Il workflow verifica nome, versione/tag e appartenenza a `main`, crea un solo
tarball e lo installa in isolamento. Prima dell'upload aspetta la CI completa
Node/Bun/browser e la parità Python sullo stesso commit di `main`. Poi pubblica
quell'archivio tramite OIDC, confronta l'integrità del file disponibile sul registry,
prova il pacchetto scaricato e crea la GitHub Release.

Le versioni pubblicate sono immutabili. Se l'upload riesce ma la verifica finale
fallisce, controllare prima la versione su npm: non ripubblicare alla cieca.
Il workflow manuale su un branch esegue soltanto build e verifiche; su un tag
esegue anche la pubblicazione. Le PR che modificano il workflow o il packaging
provano l'installazione del tarball senza avere permessi di pubblicazione.

Le suite complete partono su PR e `main`, non sui tag né sui push dei branch di
lavoro. I tag avviano soltanto il workflow di rilascio, che riusa l'esito della CI
sul commit integrato senza duplicare le suite.

## Browser

Il package distribuisce moduli ESM, non il playground compilato. Il consumatore
bundla il proprio worker e copia `wa-sqlite/dist/wa-sqlite-async.wasm` accanto al
bundle. Vedere
`docs/architecture.md` e l'esempio browser nel repository.

## Consolidamento 0.2.0

Pubblicare prima Asqueel Python 0.6.4; il commit `31ca251` deve essere accessibile
su GitHub per la CI di parità. Questa release include tutti i porting già su main,
export HTML e demo assemblea. Non include il formato modello v2 né l'unificazione
preparata separatamente: quel candidato 0.2.0 precedente è superato e non va pubblicato.
L'unificazione JS richiederà una nuova versione successiva a questo consolidamento.

Oltre alla suite ordinaria, eseguire `npm run test:file`, `npm run test:assembly`
e `npm run verify:python`. I vecchi workspace della demo sono provati attraverso
le fixture v1–v4 e il riavvio offline, senza sostituire i dati già inseriti.
