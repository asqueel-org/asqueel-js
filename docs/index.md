# Asqueel JS

```{image} _static/brand/asqueel-wordmark-primary.svg
:alt: Asqueel
:width: 360px
```

Asqueel JS is the JavaScript package of [Asqueel](https://asqueel.readthedocs.io/en/latest/).
It declares a database model with the same grammar as the Python package and runs it
on SQLite: in the browser on SQLite WebAssembly persisted in IndexedDB, on Node.js and on Bun.
It targets local applications that keep working without a network.

```js
import {defineModel} from '@asqueel/asqueel-js';

const model = defineModel(root => {
    const note = root.db({name: 'notes'}).packages().package({name: 'app'}).table({name: 'note'});
    note.options().sysFields();
    note.column({name: 'body', dtype: 'T'});
});
const rows = await model.queries(adapter).table('app.note')
    .query({columns: '$id,$body', order_by: '$id'}).fetch();
```

The model grammar, the query language and the behaviors are those of the Python
package. This manual describes what is specific to JavaScript: runtimes, adapters,
the browser, offline work and the verification against Python. For the shared
concepts it links to the [Python documentation](https://asqueel.readthedocs.io/en/latest/).

## Choose your starting point

- **New to Asqueel JS?** Read the {doc}`guide/overview`, then run the {doc}`guide/quickstart`.
- **Building an application?** Start with {doc}`guide/models`, then {doc}`guide/queries`
  and {doc}`guide/writes`.
- **Working offline in the browser?** Read {doc}`guide/browser` and {doc}`guide/transfers`.
- **Checking what is supported?** See {doc}`reference/limitations` and {doc}`reference/parity`.

```{toctree}
:maxdepth: 1
:caption: Learn

guide/overview
guide/installation
guide/quickstart
```

```{toctree}
:maxdepth: 1
:caption: Build applications

guide/models
guide/queries
guide/writes
guide/sqlite
guide/imports
guide/transfers
guide/browser
```

```{toctree}
:maxdepth: 1
:caption: Examples

guide/assembly-demo
```

```{toctree}
:maxdepth: 1
:caption: Reference

reference/api
reference/architecture
reference/parity
reference/limitations
```

```{toctree}
:maxdepth: 1
:caption: Release information

release-notes
```

Two illustrated pages present the offline scenarios:
<a href="serverless-offline.html">Serverless data applications</a> and
<a href="offline-condominium-meeting.html">The offline condominium meeting</a>.
