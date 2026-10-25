# Contributing to Asqueel JS

The priority is a working local application: complete one capability along the whole
path instead of accepting new declarations without implementing their effects.

1. Define the case and the reference Python behavior.
2. Add an independent Python model or example when a new oracle is needed.
3. Port the capability reusing the existing resolution and adapter contract.
4. Verify SQL and parameters, execution, effects and, where it applies, rollback.
5. Update the limitations and the roadmap only after the verification.

Never edit `src/generated/` or `test/fixtures/` by hand to make a test pass: run the
exporters and review the differences. The procedure is in
[docs/reference/parity.md](docs/reference/parity.md). Never copy JavaScript code into a
Python oracle.

## Local checks

```sh
npm ci
npm run update:tools
npm run check
npm run test:bun
npx playwright install chromium
npm run test:browser
```

For changes to the resolver, the compiler or the migrator also run the live Python
parity (`npm run verify:python`). Test on the real drivers: equal SQL alone is not
enough. Browser tests use their own temporary databases and must not delete
application data. Never commit `node_modules`, bundles, databases or test output.

## Documentation

The manual is in `docs/` and is built with Sphinx for Read the Docs:

```sh
python3 -m venv .venv-docs
.venv-docs/bin/pip install -r docs/requirements.txt
.venv-docs/bin/sphinx-build -W -b html docs docs/_build/html
```

Pages describe what is specific to JavaScript and link to the
[Python documentation](https://asqueel.readthedocs.io/en/latest/) for shared concepts.
Everything in the repository is written in English.

## Internal dependencies

The Genro and Gramlot tools have only a minimum version: never add upper bounds to
hide regressions. CI runs every suite after `npm run update:tools`, which also updates
the transitive Bag and TYTX packages. The lockfile reproduces a verification; `npm ci`
alone does not prove compatibility with the latest tools. Fix incompatibilities instead
of restoring old constraints.

## Playground

The playground follows the Gramlot guide
[Writing pages (GC-095)](https://github.com/gramlot-org/gramlot/blob/main/docs/public/095-writing-pages.md):
`Page.main` for the Source, a named `Logic`, `node.GET/SET` for Data, `value='^path'`
bindings (`live: true` for native inputs) and `button` with a `dataController` for
actions. `html_button` is for native HTML behavior; it runs no child controller. Check
the APIs against the latest published Gramlot release.

The shell uses the current `IndexPage`, with a navigation Bag and the `layout` and
`tree` collections. Collections and the browser Logic share the runtime through ESM
chunks. Also check switching between open tabs: iframes, editors and connections stay
alive while the shared draft updates through `storage`.

## Conventions

- ES modules; TypeScript declarations once the public contract is stable.
- One package, with separate exports for the three runtime drivers.
- Dependencies and the lockfile reviewed together; no Python process at run time.
- Unsupported features raise explicit errors before any write.
- Releases are published automatically from verified tags: see [RELEASING.md](RELEASING.md).

The playground runs the code of its editor: it is a local development tool, not a
sandbox for untrusted code.
