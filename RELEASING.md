# Releasing Asqueel JS

Public npm package: `@asqueel/asqueel-js`. Current candidate: `0.2.0`
(Python Asqueel 0.7.0 · `84408eb`). The package is experimental and does not claim
complete parity with Python. The Python reference stays pinned in
`test/fixtures/provenance.json`, independently of the npm version.

## Preparation

1. Update `package.json`, the lockfile and `CHANGELOG.md` together.
2. Verify `npm run check`, `npm run test:bun` and the CI checks, including the browser
   suite and the Python parity. Before a release also run `npm run test:file`,
   `npm run test:assembly` and `npm run verify:python`.
3. Build the documentation with `sphinx-build -W` (see [CONTRIBUTING.md](CONTRIBUTING.md)).
4. Run `npm pack` and review the file list: sources, grammar, documentation and licenses;
   no credentials, databases or playground files.
5. Install the tarball in an empty directory. Verify the public imports, an SQLite
   migration, insert and select and a second migration on Node.js and Bun, and the
   bundle of the browser entry point from the installed package
   (`node scripts/check-package.mjs <tarball>`).

## One-time npm and GitHub link

In the npm settings of `@asqueel/asqueel-js`, section **Trusted Publisher**, add GitHub
Actions with these exact values:

| Field | Value |
|---|---|
| Organization or user | `asqueel-org` |
| Repository | `asqueel-js` |
| Workflow filename | `publish.yml` |
| Environment name | `release` |
| Allowed actions | **Allow npm publish** |

No `NPM_TOKEN` or `NODE_AUTH_TOKEN` is needed: the workflow uses OIDC on GitHub runners,
Node.js 24 and npm 11.21.0. See the [npm documentation](https://docs.npmjs.com/trusted-publishers/).

## One-time Read the Docs link

Import `asqueel-org/asqueel-js` on [Read the Docs](https://readthedocs.org/) with the
project slug `asqueel-js`. The build reads `.readthedocs.yaml`, installs
`docs/requirements.txt` and fails on any Sphinx warning.

## Releases

1. Update version, lockfile and changelog; merge the pull request with green CI.
2. Create and push the tag `v<version>` on the merged commit of `main`.
3. Wait for the **Build and publish npm package** workflow.

```sh
git tag -a v0.2.0 <merged-commit> -m "Asqueel JS 0.2.0"
git push origin v0.2.0
```

The workflow checks name, version and tag and that the commit belongs to `main`, builds
one tarball and installs it in isolation. Before the upload it waits for the complete
Node.js/Bun/browser CI and the Python parity on the same commit. It then publishes that
archive through OIDC, compares the integrity of the file on the registry, tests the
downloaded package and creates the GitHub Release.

Published versions are immutable. If the upload succeeds and the final check fails,
check the version on npm first: never republish blindly. A manual run on a branch only
builds and verifies; on a tag it also publishes.

## Browser

The package ships ES modules, not the compiled playground. Consumers bundle their own
worker and serve `wa-sqlite/dist/wa-sqlite-async.wasm` next to the bundle, or pass the
bytes as `wasmBinary`. See the [browser guide](docs/guide/browser.md).
