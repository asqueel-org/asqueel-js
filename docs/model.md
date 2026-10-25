# Modello · Python 0.7.0 · 84408eb

Il riferimento è Asqueel Python **0.7.0** al commit
`84408ebfdb3b3c302f771ca6c9e82e31e9fd44df`, fissato in `test/fixtures/provenance.json`.
Il commit è main dopo la 0.7.0, con il salvataggio della ricetta in TYTX.

```js
import {defineModel, SqlBuilder} from '@asqueel/asqueel-js';

const recipe = defineModel(root => {
    const item = root.db('offline').packages().package('app').table('item');
    item.options().sysFields();
    item.column({name: 'description', dtype: 'T'});
});
const model = recipe.resolve();
const table = model.table('app.item');
console.log(table.columns.keys());
console.log(table.virtual_columns.keys());
console.log(table.logicalDeletionField); // __del_ts
const saved = recipe.toTytx();               // come recipe.source.to_tytx() in Python
const loaded = SqlBuilder.fromTytx(saved);   // come AsqueelDb('<file>.tytx') in Python
const migration = loaded.toMigration();
```

`resolveModel(recipe)` equivale a `recipe.resolve()`. Ogni risoluzione possiede i
propri dati: non modifica il source né le altre risoluzioni. I binding statici della
Data Bag sono risolti tramite Builders JS prima della preparazione.

## Source in TYTX

- `recipe.toTytx()` scrive il source della ricetta. La classe del source è
  `SqlSourceBag`, registrata come sottotipo TYTX con lo stesso nome di Python.
- `SqlBuilder.fromTytx(text)` decodifica il source e ne riesegue il nodo `db`,
  elemento per elemento, in un nuovo `SqlDatabaseConfig`. La grammatica valida
  ogni chiamata: un attributo fuori grammatica solleva un errore.
- Un file scritto da Python si carica in JS e un file scritto da JS si carica in
  Python. Il verificatore controlla che i due caricamenti producano lo stesso source
  e lo stesso JSON migrate.
- Il JSON del modello risolto non esiste più: `toJSON()` e `DbModel.fromJSON()` sono
  stati rimossi, come `model_to_json` in Python.

## Oggetti e identità

`model.db` conserva la dichiarazione del database, `model.namespaces` / `model.obj`
la radice dei package. `model.tables` è una `Map` degli stessi oggetti accessibili
con `model.table('package.table')`. I contenitori espongono `get`, `keys`, `values`,
`items` e `at('percorso')`. Le colonne espongono `table`, `pkg`, `fullname`, `dtype`,
`sqlname`, nomi descrittivi, `print_width` e `validations` (gli attributi `validate_*`).

`table.column('@relation.field')` segue le relazioni. Gli alias mantengono
`originalColumn` e sovrappongono gli attributi espliciti a quelli della destinazione.
`model.relations` contiene le relazioni dirette e inverse, con chiavi
`package.table.@name`. `table.relations.getNode(path)` espone una navigazione pigra.

## Grammatica

- Un modello parte solo da `packages().package(...)`. Uno schema fisico si dichiara
  con `package({name: 'x', sqlschema: 'p', sqlprefix: false})`.
- Opzioni di tabella: `sysFields`, `counter`, `relidx`, `df`, `fullUpd`, `sysrecords`,
  `hierarchical`, `broadcast`, `numbering`, `retention`, `archive`, `enabled_when`,
  `release`. Colonna: `readOnly`.
- `relation({related_column, ...})`; `insensitive` sostituisce `case_insensitive`.
  Una relazione senza foreign key indicizza le colonne dei due lati.
- Una pkey composta nomina la sua `compositeColumn`.
- La grammatica controlla `retention.days >= 0`, `hierarchical.depth >= 1`,
  `driver.connect_timeout`, `driver.timeout` e `driver.cached_statements >= 0` e
  `package.sqlprefix` (non vuoto, senza `_` finale). `column` dichiara i sei parametri
  `sql_pg_*` e `sql_sqlite_*`; `validate_*` è l'unica famiglia di attributi aperta.
- Nessun attributo `x_*` nel source e nel modello.

## Espansioni e confini

Sono incluse le espansioni strutturali di `sysFields` (con le cinque colonne virtuali
standard), `fullUpd`, `df`, `counter`, `hierarchical` (anche `linked_to`) e `relidx`,
con formule e nomi dei trigger. `sysrecords` e `release` attive e
`hierarchical.depth` restano rifiutate, come in Python.

`SqlDatabaseConfig` aggiunge connessioni e opzioni del driver. La risoluzione del
modello controlla le impostazioni della connessione principale come `AsqueelDb`
Python, senza aprire connessioni. Gli adapter JS restano un livello distinto.

Il JSON migrate è prodotto dal source preparato, come `SqlMigrationRenderer` Python:
le stesse opzioni e regole dei package agiscono sul modello e sulla migrazione.

Il caricamento di package Python da filesystem (`package({path})`) e le classi
`Table` dei package layout non sono disponibili in JS: gli hook si registrano nel
runtime JS. Il runtime applicativo esegue `sysFields`, default, protezioni e hook:
vedi [API e limiti](playground.md#sysfields-e-hook-applicativi).

## Particolarità del riferimento

- Due package con lo stesso nome fisico di tabella (`sqlprefix: false`) producono una
  sola tabella nel JSON migrate: vince la seconda dichiarazione, come in Python.
- `virtualRelation` resta un nodo di dichiarazione: il registro gerarchico non ne
  costruisce gli archi.
- Le colonne `formulaColumn_<x>()` sono costruite alla prima lettura delle colonne
  virtuali di una tabella, anche durante la compilazione di una scrittura, con una
  cache per ambiente.
