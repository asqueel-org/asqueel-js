# Parity with Python

The test suite compares Asqueel JS with a pinned Python reference.
`test/fixtures/provenance.json` records it:

| Package | Reference |
|---|---|
| asqueel | 0.9.0, commit `baf4582` (release tag `v0.9.0`) |
| asqueel-migration | 0.3.5 |
| genro-builders | 0.30.0 |
| genro-bag | 0.28.0 |
| genro-tytx | 0.16.4 |
| genro-toolbox (Python) / `@genrojs/toolbox` (JS) | 0.18.0 / 0.19.0 |

CI checks out the asqueel commit and installs the exact releases of
`scripts/requirements-parity.txt`. The verifier refuses another commit or version.

## Running the live comparison

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r scripts/requirements-parity.txt
ASQUEEL_PYTHON_ROOT=/path/to/asqueel PYTHON=.venv/bin/python npm run verify:python
```

Node.js and Bun are required. Without the variable the scripts look for
`.reference/asqueel-current`. `npm run export:python` regenerates the grammar, the
contract, the example sources and the fixtures; `npm run export:model` regenerates the
model corpus only. Fixtures are never edited by hand.

## What is compared

| Corpus | Cases | Compared |
|---|---|---|
| Model declarations (`test/model-inputs.json`) | 218 | outcome of every call and of the composition, composed source in TYTX, model build, migration JSON |
| Independent examples | 5 | composed source and migration JSON of recipes written separately in Python and JS |
| SQLite migrations | 2 | migration, catalog read back, empty residual diff |
| Queries and CRUD | 352 | composed source, migration JSON, exact SQL, parameters, SQLite rows |
| Write cycle (`sysFields`, hooks) | 26 | records, ordered events, nested writes, DML, stored rows after commit or rollback |
| Hierarchies and counters | 39 | as above, with moves, roots, scopes and relative indexes |
| `onUpdate` cascades | 27 | as above, with multi-level and cyclic graphs |
| CSV, JSON, TYTX imports | 49 | INSERT SQL, parameters, rows, absence of triggers, rollback |
| Transfers | 8 | source, migration JSON, catalog and values, Python → JS → Python |
| Meeting demo | 86 actions | SQL, parameters, records, counts and errors |

The query corpus has seven independent recipes: 34 base cases, 28 features, 32 computed
reads, 48 subqueries and aggregations (17 rejections), 33 callbacks (23 rejections),
46 `#TEMPLATE`/`#IN_RANGE` (18 rejections) and 131 `#PERIOD` (27 rejections).

The composed source is compared as TYTX rows, without attribute order
(`test/source-parity.js`). Expansions are not compared separately: each side expands on
its own and the migration JSON shows the physical result. The round trip is verified
both ways: Python loads every source written by Node.js and Bun, and JavaScript loads
every source written by Python, with the same migration JSON.

Each Python case runs in a separate process. Python table classes used by the oracles
are installed on the live tables as the package layout does: `Table` combined with
`SqlTable`. Clock and identifier sources are replaced only in the tests; the legacy22
identifier algorithm is also compared byte for byte with `genro_toolbox.uid.get_uuid`.

Node.js, Bun and Chromium run the same comparisons. The browser uses the saved fixtures,
not a Python process, and repeats every SELECT after reopening IndexedDB. The browser
transfer tests save the bundles they really produce in `output/`; Python verifies them:

```sh
npm run test:browser
$PYTHON scripts/verify_transfers.py --browser output/browser-transfer-returns.json
```

## Known differences

- In the query corpus with generated columns the database is created from the Python
  migrator DDL, because the JS migrator refuses generated columns.
- Errors are compared by outcome, not by message text.
- JavaScript clocks have millisecond precision; timestamps are compared as ISO strings.
