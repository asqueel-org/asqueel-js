# Queries

The query language is the Python one: `$field`, `@relation.field`, formulas,
aliases, aggregations and macros. See the Python pages
[Queries](https://asqueel.readthedocs.io/en/latest/guide/queries.html),
[Formulas](https://asqueel.readthedocs.io/en/latest/guide/formulas.html),
[Environment](https://asqueel.readthedocs.io/en/latest/guide/environment.html) and
[Row policies](https://asqueel.readthedocs.io/en/latest/guide/row-policies.html).
The JavaScript compiler produces the SQL text and parameters of the Python compiler
on SQLite. This page describes the JavaScript API.

## The query API

```js
const db = model.queries(adapter, {environment: {user: 'ada'}});
const query = db.table('notes.memo').query({
    columns: '$id,$body,@person_id.name AS person,$amount',
    where: '$amount >= :minimum',
    sqlparams: {minimum: 10},
    order_by: '$id',
});
query.compiled;               // {sql, params}
const rows = await query.fetch();
```

- `model.queries(adapter, runtime)` binds the model to an adapter. `runtime` accepts
  `environment` (an object, or a function returning one), `hooks`, `methods`, `clock`
  and `uuid`. Any other key raises an error.
- `model.queries().compile(request)` compiles without a connection.
- `fetch()` returns plain SQLite rows. `fetchRecord()` returns one record and raises
  `RecordNotFoundError` or `RecordMultipleRowsError`; `fetchRecord(true)` returns
  `null` when nothing matches. `count()` and `exists()` are also available.
- The compiler resolves packages, prefixes and SQL names with the same resolver as the
  migrations: `notes.person.name` becomes `main.query_people.display_name`.
- Draft and logical deletion filter reads. Partitions read `current_*` and `allowed_*`
  from the environment. `:env_*` parameters read the environment.

As in Python, a missing parameter becomes NULL and `limit: 0` adds no LIMIT. Python
replaces `$field` references also inside SQL string literals; the JavaScript
compiler does the same. Pass user text as parameters, not as expression fragments.

## Formulas and relations

Formula columns may nest, declare local parameters (`var_*`, `var_kwargs`) and use
`#THIS` and `#ENV`. Direct relations, also over composite keys, compile to JOINs.
Composite columns can be read and filtered, and are added as `pkey` when needed.
`GROUP BY`, `HAVING`, `DISTINCT`, `IN`/`NOT IN`, ordering and pagination follow Python.

## Subqueries and aggregations

`formulaColumn(select=...)`, `exists=...`, the named `select_*`/`exists_*`
placeholders and `subQueryColumn(query=..., aggr=...)` compile to correlated
subqueries. Aggregations over inverse relations and virtualRelation use `aggr()`:

```js
await db.table('sq.customer').query({
    columns: "$id,@invoices.aggr(count() AS n,sum($amount) AS total)",
    order_by: '$id',
}).fetch();

// join and to_json follow the child table order or an explicit one
const columns = "$id,@invoices.order_by('$id DESC').aggr(join($code, ',', '-') AS codes)";
```

`aggr()` supports `count()`, `sum`/`avg`/`min`/`max` over expressions, `join` with
separator and placeholder, and `to_json`. Several children never duplicate the main
record. Children include draft and logically deleted rows and ignore the partition,
unless the declaration says otherwise, as in Python.

## Compiler callbacks

Python table methods that produce SQL are registered in `methods`, outside the model:

```js
const methods = {
    'app.owner': {
        sql_formula_scaled(attr) {
            attr.var_factor = this.db.currentEnv.factor ?? 2;
            return '$amount * :factor';
        },
        subquery_total() {
            return {table: 'app.line', columns: 'SUM($amount)', where: '$owner_id=#THIS.id'};
        },
        env_label() { return "'owner SQL'"; },
        formulaColumn_extra() {
            return [{name: 'twice', sql_formula: '$amount * 2'}];
        },
    },
};
const db = model.queries(adapter, {methods, environment: {factor: 3}});
```

- The static declarations use `sql_formula: true`, `select: 'total'`,
  `exists: 'total'`, `query: 'total'` and `#ENV(label)`.
- `formulaColumn_<x>()` returns one declaration or a list. As in Python, these columns
  are built at the first read of the table virtual columns, also when a write is
  compiled, and are cached per environment object.
- `this` exposes `fullname`, `name`, `db.currentEnv` (a copy) and `db.table(name)`.
- Callbacks are synchronous. A Promise, a missing method, an invalid return value,
  a conflicting definition or a cycle raises an error.

## Macros

| Macro | Where | Note |
|---|---|---|
| `#THIS.field` | formulas, subqueries | the owning record |
| `#ENV(name)` | everywhere | environment value, quoted; or `env_<name>()` SQL |
| `#TEMPLATE('...', expr AS key, ...)` | columns, WHERE, ORDER BY, GROUP BY, HAVING, formulas | NULL contributes empty text |
| `#IN_RANGE($field,:low,:high)` | WHERE, formulas | inclusive bounds; `null` removes a bound |
| `#PERIOD($field,param)` | WHERE, also of subqueries | natural-language dates |

```js
const rows = await db.table('app.person').query({
    columns: "#TEMPLATE('${n} (${c})', $name AS n, @city_id.name AS c) AS label",
    where: '#IN_RANGE($amount,:low,:high)',
    sqlparams: {low: 10, high: 20},
}).fetch();
```

### Natural-language dates

`#PERIOD` decodes the text with `parseDateExpression` of `@genrojs/toolbox`, the
JavaScript port of `genro_toolbox.dates` used by Python. There is nothing to register:

```js
const db = model.queries(adapter, {environment: {locale: 'it-IT', workdate: '2026-10-21'}});
const rows = await db.table('period.event').query({
    columns: '$id,$issued',
    where: '#PERIOD($issued,period)',
    sqlparams: {period: 'mese scorso'},
}).fetch();
// WHERE (t0."issued" BETWEEN :period_from AND :period_to)
// period_from: '2026-09-01', period_to: '2026-09-30'
```

- `locale` and `workdate` are required. `workdate` is a civil ISO date `YYYY-MM-DD`.
- One day gives `=`, two bounds `BETWEEN`, one bound `>=` or `<=`, an empty period `true`.
- As in Python, commas become `;` before parsing, so some texts accepted by the parser
  are refused by `#PERIOD`.
- `#PERIOD` is not a general macro: columns, ORDER BY and `sql_formula` refuse it. A
  formula may declare a SELECT whose WHERE uses it.

## Not available

`#BAG`/`#BAGCOLS`, result metadata, application codecs (`X`, `Z`, `P` columns),
navigation as a JOIN through a many relation, aggregations with `ask` and JOINs with
custom conditions. See {doc}`../reference/limitations`.
