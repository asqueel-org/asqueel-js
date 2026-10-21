> Aggiornamento 0.6.1: il confronto attivo usa l'intero `DbModel` e migrate.
> `subtable` e le opzioni `partition`/`tenant` sono state ritirate dal riferimento;
> le vecchie sezioni che le descrivono non costituiscono più API attiva.
> Vedi [modello attuale](model.md) e [parità](parity.md).

# Composizione dei contributi

La composizione avviene sul sorgente dichiarativo, prima di applicare default,
risolvere riferimenti o espandere opzioni in colonne fisiche. Il riferimento
è `SqlBuilder` e `_compose_source` delle revisioni Python registrate nelle fixture.

## Estendere lo stesso modello

```js
import {defineModel} from '@asqueel/asqueel-js';

const model = defineModel(root => {
    const pkg = root.db({name: 'notes', implementation: 'sqlite'})
        .packages().package({name: 'app', sqlschema: 'main'});
    const note = pkg.table({name: 'note', pkey: 'id', name_long: 'Nota'});
    note.column({name: 'id', dtype: 'I'});
    note.column({name: 'body', dtype: 'T'});
});

model.contribution('application', (_root, builder) => {
    const pkg = builder.node('db.packages.app');
    const note = pkg.table({name: 'note', name_long: 'Annotazione'});
    note.column({name: 'body', size: ':200'});
    note.column({name: 'done', dtype: 'B', sqldefault: '0'});
});
const structure = model.toMigration();
```

`contribution(name, callback)` è sincrono. Il nome precedente viene ripristinato
anche se il callback fallisce. Il callback non è una transazione: le dichiarazioni
riuscite prima di un errore rimangono, come nel context manager Python. Un singolo
merge di attributi in conflitto non pubblica modifiche parziali.

Le dichiarazioni identiche sono idempotenti; quelle compatibili completano gli
attributi mancanti. Cambiare un valore già dichiarato nello stesso contributo
produce errore. Un contributo con nome diverso può sovrascriverlo. Tornare a un
nome già usato conserva il controllo dei conflitti per gli attributi che gli
appartengono. Omissione e `null` esplicito rimangono distinti.

I contenitori (`packages`, `tables`, `columns`, `options`, ecc.) sono singleton.
Package e schemi ripetuti mantengono l'identità; dentro i package la regola si
estende alle dichiarazioni con nome. Le scorciatoie `pkg.table()` e
`table.column()` instradano nei contenitori canonici. Il vecchio percorso a schemi
fisici mantiene le restrizioni Python sulle dichiarazioni ripetute delle tabelle.
Gli esempi usano attributi in oggetti JS: non viene riprodotta tutta la sintassi
posizionale delle chiamate Python.

## Comporre modelli indipendenti

```js
import {defineModel, composeModels} from '@asqueel/asqueel-js';

const base = defineModel(root => {
    const table = root.db({name: 'notes', implementation: 'sqlite'})
        .packages().package({name: 'app', sqlschema: 'main'})
        .table({name: 'note', pkey: 'id'});
    table.column({name: 'id', dtype: 'I'});
    table.column({name: 'body', dtype: 'T'});
});
const application = defineModel(root => {
    root.db({name: 'notes'}).packages().package({name: 'app'})
        .table({name: 'note'}).column({name: 'body', comment: 'Testo locale'});
});

const model = composeModels(base, application);
const migration = model.toMigration();
```

Gli argomenti sono builder già costruiti, ordinati dalla base al contributo più
specifico. Il risultato possiede una copia del sorgente; gli input rimangono
invariati anche se la composizione fallisce. `model.clone()` conserva anche la
provenienza degli attributi usata per rilevare i conflitti.

## Opzioni, reset e colonne virtuali

I dizionari dei campi di `sys_fields` si uniscono per chiave. Anche `parameters`,
`templates`, `records` e `handlers` si uniscono a un solo livello: un record o
un oggetto annidato viene sostituito come valore, non fuso ricorsivamente.
Le liste, come `requires.packages`, vengono sostituite.

Disabilitare un campo di sistema conserva la configurazione precedente, che
torna disponibile alla riattivazione. `options.reset({name: 'sys_fields'})`
invece elimina la configurazione accumulata. Per opzioni con identità, per
esempio `numbering`, reset rimuove tutte le istanze di quel tipo. Il reset non
crea un nodo runtime: è metadato dell'operazione di composizione e sopravvive
alla composizione di sorgenti indipendenti, alla copia e al passaggio al worker.

Cambiare il tipo di una colonna virtuale conserva identità, posizione e attributi
comuni, eliminando la definizione specifica del vecchio tipo. Non consente di
trasformare una colonna fisica in virtuale. Questo riguarda il model: l'esecuzione
delle colonne virtuali nelle query rimane fuori dalla copertura attuale.

## Verifica con la 0.6.1

Il corpus di [parità](parity.md) esegue le stesse chiamate in Python e in JS e
confronta l'accettazione dei contributi, il modello gerarchico completo e migrate.
I vecchi confronti parziali di `ResolvedModel` sono stati sostituiti.

Rimane una differenza documentata sullo stato intermedio di un errore: Python
può inserire il primo nodo `validation` prima di rilevare un conflitto con
`validate_len`; JS controlla prima dell'inserimento. Dopo il successivo override
valido il modello finale coincide. I test non dichiarano equivalenti quegli
stati intermedi falliti e non modificano Python per nasconderli.

Node, Bun e il worker Chromium eseguono gli stessi casi. Il browser verifica
anche migrazioni reali, vincoli e persistenza dopo riapertura su database
IndexedDB temporanei. Gli esempi gruppi/formule e virtualRelation sono modificabili
nel playground e mostrano separatamente il JSON completo e il JSON migrate.
