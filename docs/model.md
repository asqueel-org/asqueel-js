# Modello risolto · Python 0.6.1

Il contratto del modello portabile è il `DbModel` gerarchico di Asqueel **0.6.1**, commit
`8a8ffd3d64ba12f7aa6e6e74ec80b7ff600ff988` (correzione #44 successiva alla release). La versione del codice di riferimento è fissata;
la grammatica JSON da sola non implementa espansioni, relazioni o migrazioni.

```js
import {defineModel, DbModel} from '@asqueel/asqueel-js';

const recipe = defineModel(root => {
    const item = root.db('offline').packages().package('app').table('item');
    item.options().sys_fields();
    item.column({name: 'description', dtype: 'T'});
});
const model = recipe.resolve();
const table = model.table('app.item');
console.log(table.columns.keys());
console.log(table.virtual_columns.keys());
console.log(table.logicalDeletionField); // __del_ts
const json = model.toJSON();
const restored = DbModel.fromJSON(JSON.stringify(json));
const migration = restored.toMigration();
```

`recipe.toJSON()` equivale a `recipe.resolve().toJSON()`. `resolveModel(recipe)`,
`modelToJSON(model)` e `modelFromJSON(document)` sono le funzioni equivalenti.
Ogni risoluzione possiede i propri dati: non modifica il sorgente né le altre risoluzioni.
I binding statici della Data Bag vengono risolti tramite Builders JS prima della
preparazione; la copia della ricetta isola anche la Data Bag. Il JSON completo
contiene già i valori risolti e non richiede la Data Bag originale.

## Oggetti e identità

`model.db` conserva la dichiarazione del database, `model.namespaces` / `model.obj`
la radice di package o schemi. `model.tables` è una `Map` degli stessi oggetti accessibili
con `model.table('package.table')`. I contenitori espongono `get`, `keys`, `values`,
`items` e `at('percorso')`; `at('.percorso')` parte dalla radice del contenitore.
Le colonne espongono `table`, `pkg`, `fullname`, `dtype`, `sqlname`, nomi descrittivi,
`print_width` e `validations`. Le tabelle espongono PK, nomi SQL e campi delle policy.

`table.column('@relation.field')` segue le relazioni. Gli alias mantengono il riferimento
`originalColumn` e sovrappongono gli attributi espliciti a quelli della destinazione.
I cicli degli alias sono rifiutati quando si risolve il percorso, come nella 0.6.1.
`model.relations` contiene gli attributi delle relazioni dirette e inverse, con chiavi
`package.table.@name`. `table.relations.getNode(path)` espone una navigazione pigra.

## JSON completo

Il formato è `asqueel-model`, versione `1`, riferimento `0.6.1`. Contiene:

- albero del database e albero dei namespace, in ordine;
- **tutti** gli attributi e figli di ogni nodo, incluse opzioni, validazioni,
  cifratura dichiarata, formule, alias, gruppi, compositi e indici generati;
- tutte le relazioni registrate da Python, nei due versi;
- origine degli indici generati e default degli alias necessari al ripristino.

Non serializza puntatori ai genitori, istanze operative `SqlTable`, callback o cache:
le identità e i collegamenti vengono ricostruiti. Il codec Python storico `model_to_json`
accetta ancora `ResolvedModel` e non il `DbModel` della 0.6.1; per questo l'oracolo usa
un attraversamento completo esplicito, senza elenchi di attributi da selezionare.

## Espansioni e confini

Sono incluse le espansioni strutturali di `sys_fields` (anche le cinque virtuali standard),
`full_update`, `record_hash`, `audit`, `dynamic_fields`, `auto_counter`, `protection`,
`hierarchical`, `attachments` e `relative_index`, con metadati, formule e nomi dei trigger.
La 0.6.1 include `hierarchical.linked_to`: genera la chiave verso il master, il
collegamento inverso alla radice e i nomi dei relativi hook. Sono ammessi anche
nomi personalizzati per il campo contatore gerarchico. Le altre opzioni conservano
le dichiarazioni. `system_records` e `release` attive e `hierarchical.depth`
restano rifiutate dalla 0.6.1.

`SqlDatabaseConfig` aggiunge le dichiarazioni di connessione e le opzioni del driver.
Risolverlo non apre connessioni: i dati amministrativi non diventano tabelle o relazioni.
Gli adapter JS restano un livello distinto.

Il perimetro è il modello dichiarativo serializzabile. Classi Python `x_table_class`,
importazione di package Python da filesystem, mixin e callback eseguibili non sono
trasferibili tramite JSON: richiedono equivalenti JS, non fanno parte di questo codec.
Le dichiarazioni di default, validazione, cifratura e trigger **non eseguono** tali
comportamenti sulle righe. Questo appartiene alla successiva fase delle query/runtime.

## Differenze rispetto al precedente PoC

- `inverse` → `relation_name`; azioni applicative `onDelete` / `onUpdate`,
  azioni SQL `onDelete_sql` / `onUpdate_sql`.
- `sqldefault` → `sql_default`, `extra_sql` → `sql_extra`,
  `generated_expression` → `sql_generatedExpression` nelle dichiarazioni.
  Il JSON migrate mantiene le chiavi del proprio formato `structure-1.0`.
- `subtable`, le opzioni `partition` e `tenant`, e attributi extra non dichiarati
  sono rimossi. Le partizioni si dichiarano con `partition_<campo>` sulla tabella.
  L'esempio gruppi usa una formula esplicita al posto di `subtable`.
- `virtualRelation` resta un nodo di dichiarazione: nella 0.6.1 il registro gerarchico
  non ne costruisce gli archi. Non anticipiamo la futura compilazione delle query.

## Particolarità del riferimento

Il riferimento include la correzione Python della [issue #44](https://github.com/asqueel-org/asqueel/issues/44).
I default omessi appartengono a ogni singola dichiarazione: `indexed=False` su un
campo di sistema resta esplicito anche dopo l'aggiunta di una colonna estranea.
Il caso `061/sysfield_explicit_indexed_false` conserva questa regressione nel corpus
differenziale, confrontando modello completo e migrazione. Un valore omesso continua
a ricevere il default di `sys_fields`. La release PyPI 0.6.1 contiene ancora il difetto;
il confronto usa il commit corretto fissato in `provenance.json`, con Builders 0.29.0.

Il JSON mantiene la versione di formato `1`, ma dichiara il riferimento `0.6.1`.
Il ripristino richiede questo riferimento: i vecchi snapshot `0.6.0` vanno rigenerati
dalla ricetta, per applicare le nuove espansioni in modo esplicito.

Il renderer Python ha inoltre due percorsi: i package/opzioni passano dal modello
risolto; uno schema fisico semplice viene proiettato direttamente. `recipe.toMigration()`
segue la stessa scelta. `model.toMigration()` proietta sempre il modello risolto,
come `to_physical_builder(model)` in Python. Alcune dichiarazioni fisiche storiche
(ad esempio PK multiple senza un composito nominato) possono migrare direttamente
ma non essere navigabili dal `DbModel` Python: i due esiti sono verificati separatamente.
