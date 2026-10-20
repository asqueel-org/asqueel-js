# Composizione dei contributi

La composizione avviene sul sorgente dichiarativo, prima di applicare default,
risolvere riferimenti o espandere opzioni in colonne fisiche. Il riferimento
è `SqlBuilder` e `_compose_source` delle revisioni Python registrate nelle fixture.

## Estendere lo stesso modello

```js
import {defineModel} from '@asqueel/js';

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
import {defineModel, composeModels} from '@asqueel/js';

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

## Colgroups e subtables

```js
const details = table.colgroup({
    name: 'details', name_long: 'Dettagli', col_dtype: 'T', col_size: ':80',
});
details.column({name: 'city'});                 // details.001, size :80
details.column({name: 'street', size: ':120'}); // details.002, size :120
table.subtable({
    name: 'active', condition: '$id > :minimum', parameters: {minimum: 0},
    name_long: 'Attivi',
});
```

Il gruppo resta un nodo dichiarativo vuoto: i membri vengono inseriti nei normali
contenitori della tabella. Sono applicati solo i default `col_*` dichiarati per
quel tipo di elemento; gli attributi già presenti e quelli espliciti prevalgono.
Una nuova chiamata allo stesso gruppo conserva l'identità e non può cambiarne
la definizione, anche in un contributo successivo. La composizione di modelli
indipendenti, invece, unisce gli attributi come Python. Le colonne virtuali
possono cambiare tipo conservando l'ordinale del gruppo.

Le subtables mantengono condizione, etichette e parametri; `parameters` si fonde
per chiave secondo le normali regole dei contributi. La risoluzione genera una
formula booleana `subtable_<name>`, con `var_*` derivati dai parametri e dagli
attributi `condition_*` (questi ultimi prevalgono). Una formula già dichiarata
può aggiungere metadati, ma non contraddire tipo o espressione generati.
Il JSON migrate contiene solo la struttura fisica. Non viene creata una tabella
per ogni subtable e non viene memorizzata la formula come colonna SQLite.
Le query su questi filtri e sulle colonne virtuali sono ancora escluse e rifiutate.

Due comportamenti del riferimento Python sono mantenuti e verificati:

- Il merge di colonne dello **stesso tipo** da gruppi in modelli indipendenti
  usa l'ordinale del contributo entrante; può quindi duplicare ordinali. La
  conservazione dell'ordinale precedente vale nel merge che cambia tipo virtuale.
- `group.index(...)` può essere dichiarato, ma il modello Python rifiuta poi
  l'attributo `group` sull'indice. Dichiarare gli indici con `table.index(...)`.

## Verifica e differenza nota

58 casi eseguono le chiamate nel Python reale e separatamente in JavaScript.
Confrontano l'accettazione/rifiuto delle dichiarazioni, il sorgente finale
(inclusi metadati di reset e disattivazione), l'isolamento degli input e il JSON
migrate quando il modello è renderizzabile. Un caso riguarda solo la composizione
del sorgente; uno verifica il rifiuto di una collisione fisico/virtuale.
I 23 casi dedicati a colgroups/subtables confrontano anche le dichiarazioni e
gli attributi pertinenti delle colonne nel modello risolto, oppure il rifiuto
dei conflitti. È una proiezione esplicita delle nuove capacità, non un confronto
completo di tutte le proprietà di `ResolvedModel`.

Nel Python di riferimento, la prima `column.validation(len=...)` che confligge
con un `validate_len` esplicito solleva errore dopo aver inserito il nodo
`validation`. JS controlla prima dell'inserimento e lascia il sorgente invariato.
Il caso `validation_flat_then_node` registra questa differenza tramite
`knownPythonMutation`: dopo il successivo override valido, il sorgente finale e
il JSON migrate devono essere uguali. Non dichiaramo parità di quello stato
intermedio errato e non modifichiamo il checkout Python per nasconderlo.

`npm run verify:python` verifica dal vivo i casi su Node e Bun; la CI esegue anche
il corpus nel worker Chromium. Il pulsante **Verifica composizione con Python**
nel playground usa gli stessi oracoli salvati e verifica una migrazione composta
reale su WASM/IndexedDB, con dati persistiti e diff vuoto dopo riapertura.
Un secondo database temporaneo verifica lo stesso ciclo con colgroups/subtables,
includendo serializzazione, inserimento e lettura tramite modello. L'esempio
`examples/groups.js` è selezionabile e modificabile nel playground.

La composizione non completa da sola il model: virtualRelation, tutte le
validazioni di dominio e alcuni casi di rimappatura rimangono nella roadmap.
