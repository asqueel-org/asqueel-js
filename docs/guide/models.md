# Models

A model is declared on a `SqlBuilder`. The vocabulary — packages, tables, columns,
virtual columns, relations, options — is the Python grammar, exported to
`src/generated/grammar.json`. For the meaning of each element see the Python pages
[Models](https://asqueel.readthedocs.io/en/latest/guide/models.html) and the
[grammar reference](https://asqueel.readthedocs.io/en/latest/grammar.html).
This page describes the JavaScript syntax and what differs.

## Declaring a model

```js
import {defineModel, SqlBuilder} from '@asqueel/asqueel-js';

const model = defineModel(root => {
    const db = root.db({name: 'demo', implementation: 'sqlite'});
    const crm = db.packages().package({name: 'crm', sqlschema: 'main'});
    const customer = crm.table({name: 'customer'});
    customer.options().sysFields({draft: true});
    customer.column({name: 'name', dtype: 'T', notnull: true});
    customer.formulaColumn({name: 'label', sql_formula: "upper($name)"});
});

class Shop extends SqlBuilder {
    main(root) { /* same declarations */ }
}
const shop = new Shop();
shop.create();
```

- Declarations are synchronous calls that take one attributes object. The positional
  argument of the Python call (`name`, `related_column`, `columns`, ...) is a key of
  that object; `relation('app.author.id')` with a string is also accepted.
- Containers (`packages`, `tables`, `columns`, `options`, ...) are singletons.
  `package.table()` and `table.column()` route into the canonical containers.
- A model starts from `packages().package(...)`. A physical schema is a package with
  `sqlschema` and `sqlprefix: false`.
- An attribute outside the grammar raises an error at declaration. So does a value of
  the wrong type, including the grammar custom types: `retention.days >= 0`,
  `hierarchical.depth >= 1`, driver timeouts `>= 0` and `package.sqlprefix`
  (nonempty, without a trailing `_`).

## Resolving the model

```js
const resolved = model.resolve();          // DbModel
const table = resolved.table('crm.customer');
table.columns.keys();                      // physical columns
table.virtual_columns.keys();              // formulas, aliases, system formulas
table.column('@author_id.name');           // follows relations
resolved.relations;                        // direct and inverse relations
```

Resolution applies signature defaults, package types and option expansions, then
builds the hierarchical model: the same steps as the Python live model. It does not
change the source. Each resolution owns its data. Building the model also checks the
main connection settings, as Python `AsqueelDb` does, without connecting.

`model.toMigration()` renders the migration JSON from the same prepared source:
see {doc}`sqlite`.

## Options

`sysFields`, `counter`, `relidx`, `df`, `fullUpd` and `hierarchical` (also with
`linked_to`) expand into columns, formulas, relations and trigger names, as in
[Python](https://asqueel.readthedocs.io/en/latest/guide/models.html).
The write cycle executes `sysFields`, `hierarchical`, `counter` and `relidx`:
see {doc}`writes`. Other options are kept as declarations; a write on a table where
one of them is enabled raises an error. `sysrecords`, `release` and
`hierarchical.depth` raise an error when enabled.

## Saving the source in TYTX

```js
const text = model.toTytx();                 // recipe.source.to_tytx() in Python
const recipe = SqlBuilder.fromTytx(text);    // AsqueelDb('<file>.tytx') in Python
```

- The source class is `SqlSourceBag`, registered as a TYTX subtype under the same
  name as in Python.
- `fromTytx` decodes the payload and replays its `db` node, element by element,
  into a new `SqlDatabaseConfig`. The grammar validates every call.
- A file written by Python loads in JavaScript and the other way round; the two
  loads give the same source and the same migration JSON.

The resolved model has no JSON form. The source is what gets saved.

## Contributions

```js
model.contribution('application', (_root, builder) => {
    const note = builder.node('db.packages.app').table({name: 'note', name_long: 'Annotation'});
    note.column({name: 'body', size: ':200'});
});
```

The same rules as the Python `contribution` context manager apply:

- identical declarations are idempotent; compatible ones complete missing attributes;
- changing a value inside the same contribution raises an error; another contribution
  may override it;
- an omitted attribute and an explicit `null` stay distinct;
- the callback is synchronous and is not a transaction: declarations made before an
  error remain.

## Composing independent models

```js
import {composeModels} from '@asqueel/asqueel-js';

const model = composeModels(base, application);
```

Arguments are built builders, from the base to the most specific one. The result owns
a copy of the source; the inputs do not change, also when composition fails. As in
Python `compose_recipe`, composition validates the shape of the source.
`model.clone()` keeps the attribute origins used to detect conflicts.

## Options, resets and virtual columns

- The field dictionaries of `sysFields` merge by key. `parameters`, `templates`,
  `records` and `handlers` merge one level deep; lists such as `requires.packages`
  are replaced.
- Disabling a system field keeps its configuration for a later re-enable.
  `options.reset({name: 'sysFields'})` drops the accumulated configuration.
  A reset survives composition, copies and the transfer to a worker.
- Changing the kind of a virtual column keeps identity, position and common
  attributes. A physical column cannot become virtual.

## Column groups and virtualRelation

`colgroup` assigns group names and column defaults; its columns are routed to the
table containers. `virtualRelation({name, table, condition, ask, var_...})` is kept
as a declaration: it produces no foreign key and no relation edge in the resolved
model, as in Python. The compiler executes aggregations over a virtualRelation:
see {doc}`queries`.

## Not available in JavaScript

- `package({path})`: loading a Python package folder and its `Table` classes.
  Table methods and hooks are registered in the JavaScript runtime instead.
- Python callables and resolvers inside declarations.
