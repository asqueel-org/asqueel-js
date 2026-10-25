# Importing CSV, JSON and TYTX

`table.sql_insert(source, options)` ports the Python contract of
`SqlTable.sql_insert`, `table_io.read_records` and `adaptRecord`
([Python: data files](https://asqueel.readthedocs.io/en/latest/guide/data-files.html)).
The import is direct SQL: it runs no field or table trigger, counter, hierarchy or
cascade. Use `table.insert(record)` for the application write cycle.

```js
const queries = model.queries(adapter);
const products = queries.table('app.product');

// A file chosen by the user: the extension selects the format.
const count = await products.sql_insert(fileInput.files[0]);

// Text or a stream without a name: explicit format.
await products.sql_insert('id,name,price\n1,Tea,1.50\n', {format: 'csv'});
await products.sql_insert('[{"id":2,"name":"Coffee"}]', {format: 'json'});
await products.sql_insert('{"id":3,"price":"2.25::N"}::JS\n', {format: 'tytx'});

// Records and lists: adaptation is off by default, as in Python.
await products.sql_insert([{id: '4', price: '3.10'}], {adapt: true});
```

## Sources and formats

In the browser `File`, `Blob`, `ReadableStream`, text and UTF-8 bytes are accepted.
Node.js and Bun also accept async streams and iterables; a Node `ReadStream` gives
the extension through `path`. A string is content, not a path: for a Node file use
`createReadStream(path)`. `format` wins over the extension; extensions are
case-insensitive, format names are lowercase.

- **CSV:** the first row holds the headers, comma separator, quoting and double
  quotes as in the Python standard reader. Empty and missing cells become `null`;
  spaces in text fields stay. There is no separator sniffing or column remapping.
- **JSON:** an array of records. The incremental reader also follows the current
  Python leniency about separators and text after the closing bracket.
- **TYTX:** one TYTX JSON object per line, with the `::JS` suffix; empty lines are
  skipped. XML and MessagePack are not formats of this importer.

The content is read incrementally and inserted in blocks of **1,000 records**, as in
Python; the whole file is never loaded in memory. A file returns the number of
records; other sources return the record or list, adapted. The SQL keeps the Python
order and uses no RETURNING for lists.

## Types, keys and adaptation

For files `adapt` is on by default, also for TYTX. Strings are converted according
to the column type; typed values stay as they are. Integers, booleans
(yes/no, y/n, true/false, 1/0), decimals, ISO dates and times are verified. An empty
string in a typed column becomes `null`; JSON keeps the empty string for text columns.
An unknown column is an error. `adapt: false` disables adaptation, as in Python.

Decimal text and civil dates, with offsets and microseconds, reach SQLite unchanged:
they never pass through `Number` or a UTC normalization. SQLite keeps its numeric
affinity rules, so a NUMERIC column has no arbitrary decimal precision. Integers beyond
the safe range and non-finite floats are refused. ISO week dates and offsets with
seconds are not ported; nested Bags have no import codec.

Missing keys follow `checkPkey`: integer keys advance within the block, keys with an
SQL default are left to the database. INSERT statements omit nulls, as in Python, so
SQL defaults apply; application defaults and hooks do not run.

To specialize `adaptRecord`, register it in the runtime:

```js
const queries = model.queries(adapter, {hooks: {
    'app.product': {
        adaptRecord(record) {
            record = this.adaptRecord(record); // the standard adaptation of the model
            record.name = record.name.toUpperCase();
            return record;
        },
    },
}});
```

The context exposes `db`, `model`, `fullname` and the standard adaptation. With
`adapt: false` the method is not called. Adaptation errors name the table, the
record number (from 1) and the column.

## Transactions

A standalone call opens an atomic transaction. Inside `queries.transaction` use the
`tx` table: the import joins the open transaction. A parsing, conversion or constraint
error also rolls back the blocks already inserted. Python leaves commit and rollback to
the caller; the comparison uses the transaction boundary of the JavaScript API.

In the browser the `File` goes to the SQLite worker, with no backend. Apply the model
migration first. The data is saved in IndexedDB.
