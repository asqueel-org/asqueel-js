import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSameSource} from './source-parity.js';
import oracle from './fixtures/cascades.json' with {type: 'json'};
import {cascadesModel, runCascadeCase} from './cascades-runner.js';
import {nativeSQLite} from './native-sqlite.js';

test('onUpdate model and migration match independent Python declarations', () => {
    assertSameSource(cascadesModel, oracle.source);
    assert.deepEqual(cascadesModel.toMigration(), oracle.desired);
});
for (const entry of oracle.cases) test(`Python application onUpdate: ${entry.name}`, async () => {
    const adapter = nativeSQLite();
    try { assert.deepEqual(await runCascadeCase(adapter, entry.input), entry.expected); }
    finally { await adapter.close(); }
});
