# Snapshots: Python → browser → Python

A transfer moves **the recipe source and records**. It implements no synchronization,
conflict handling, record ownership or authorization: the application chooses what to
send and how to apply what comes back. The browser never runs Python.

## Python: preparing the snapshot

`python/asqueel_transfer.py` uses the Asqueel, genro-builders, genro-bag and TYTX
packages already available in the Python application.

```python
from asqueel_transfer import export_transfer

bundle = export_transfer(
    builder,
    records={
        'work.document': document_records,
        'work.line': line_records,
    },
    tables=['work.document', 'work.line'],
)
# Send the JSON envelope through the transport the application chooses.
```

- `records` holds iterables of dictionaries with **every physical column**, primary
  keys included; leave virtual formulas and aliases out. The application reads the
  subset from its server. Dates, datetimes, times, `Decimal` and booleans are encoded
  in TYTX; each table is one TYTX string, one record per line. Text that looks like a
  TYTX suffix (`::D`) is protected as text (`::T`).
- Omit `tables` for the whole model; `packages=['work']` selects packages. The two
  selections intersect. Tables transferred with structure only may be left out of
  `records`.
- A relation to an excluded table is an error: include its structure and, for foreign
  keys, the needed records. Nothing is downloaded automatically and no relation is removed.

The source is the **recipe source in TYTX** (`SqlSourceBag`), with tags, labels,
attributes and metadata: not the resolved model, not a list of calls. A separate copy
sets the implementation to `sqlite` and the package schemas to `main`, keeping SQL
names and prefixes; a name collision is an error. The original builder does not
change. Connections are excluded and listed in `omitted`. Declaration attributes must
be portable JSON values; resolvers and runtime objects are not transported. Hooks
needed offline come from the JavaScript application.

## Browser, Node.js and Bun

```js
import {importTransfer, exportTransfer} from '@asqueel/asqueel-js/transfer';
import {openBrowserSQLite} from '@asqueel/asqueel-js/adapters/browser';

const sqlite = await openBrowserSQLite('my-offline-work');
const {builder, counts} = await importTransfer(sqlite, bundle);
const db = builder.queries(sqlite);
await db.table('work.document').update({id: 'd1', title: 'Changed offline'});

const returned = await exportTransfer(sqlite, builder);
// The application stores or sends `returned` when it decides to.
```

- `readTransfer(bundle)` validates the bundle and rebuilds the builder without I/O.
- `importTransfer` applies the migration, then loads every table in one transaction.
  Explicit NULLs stay; defaults and triggers are not applied. Foreign keys are checked
  at the end, so parent/child order does not matter. An error or a duplicate rolls back
  **all imported data**; the migration is an earlier transaction and stays. It is not
  an upsert.
- `exportTransfer` reads a consistent snapshot of the chosen tables
  (`{tables: [...]}`, all by default) and keeps the source. It filters no rows and
  computes no delta or deletion. IndexedDB keeps the database, not the builder: keep
  `bundle.source` to reopen after a reload.

Supported column types: A, B, C, D, DH, DHZ, H, I, L, N, R, T, **X (Bag)** and
**O (blob)**. Dates keep their civil representation, time zone and microseconds.
Numbers keep SQLite precision. Integers beyond the JavaScript safe range are refused.
Small snapshots are materialized in memory.

## Bag and blob fields

Python records hold `Bag` for X columns and `bytes`, `bytearray` or `memoryview` for O
columns. Convert a Bag read as XML with `Bag.from_xml(xml)` first. Blobs travel as the
TYTX `RAW` type (base64) and are stored as **SQLite BLOB**, without UTF-8 conversion.

Bags travel in the TYTX `X` format: node order, labels, tags, attributes, nesting,
typed values and bytes are kept, also JSON dictionaries and lists inside the Bag.
Resolvers are refused. An empty Bag, an empty blob and NULL stay distinct.

The local database and the Python staging database keep the Bag as **TYTX text**, not
legacy XML. Export returns the original TYTX without decoding it through JavaScript
`Date`, so time zones, microseconds and Decimal precision of nested fields stay intact.
`Bag.fromTytx(text)` decodes it in JavaScript; re-encoding after changes applies the
JavaScript type limits (`Date` has millisecond precision).

## Back to Python

```python
from asqueel_transfer import read_transfer, load_transfer

portable_builder = read_transfer(returned)
# A separate staging database; this does not synchronize the remote database.
load_transfer(returned, 'returned.sqlite')  # empty destination
```

The Python receiver requires an empty SQLite destination. `genro_tytx.from_tytx(line)`
gives real `Bag` and `bytes` objects. Conversion to legacy XML and writing into the
application database stay with the caller.

The offline playground and the single HTML file that use transfers are described in
{doc}`browser`.
