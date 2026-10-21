import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeSQLite as openNodeSQLite} from './native-sqlite.js';
import {readTransfer, importTransfer} from '../src/transfer.js';
import {runTransfer, transferSnapshot} from './transfer-runner.js';
import oracle from './fixtures/transfers.json' with {type:'json'};
for (const entry of oracle) test(`source Bag and TYTX round trip: ${entry.name}`, async () => {
    const db = openNodeSQLite(), second = openNodeSQLite();
    try {
        const result = await runTransfer(db, entry);
        const {builder} = await importTransfer(second, result.bundle);
        assert.deepEqual(await transferSnapshot(second, builder), entry.after);
        assert.ok(!JSON.stringify(entry.bundle).includes('never-send-this'));
    } finally {await db.close(); await second.close();}
});
test('bad version/table/source are rejected before migration', async () => {
    for (const change of [{version:2}, {source:'not a bag'}, {data:{unknown:''}}]) {
        assert.throws(() => readTransfer({...oracle[1].bundle,...change}));
    }
});
for (const [name, bad] of [
    ['duplicate key', b => b.data['work.document'] += b.data['work.document'].split('\n')[0]+'\n'],
    ['missing parent', b => b.data['work.document']=''],
    ['missing column', b => b.data['work.document']='{"id":"d1"}::JS\n'],
    ['invalid TYTX', b => b.data['work.document']='bad data'],
    ['unsafe integer', b => b.data['work.line']=b.data['work.line'].replace('"quantity":2','"quantity":9007199254740992')],
]) test(`snapshot rollback across tables: ${name}`, async () => {
    const db = openNodeSQLite(), bundle=structuredClone(oracle[1].bundle); bad(bundle);
    try {
        await assert.rejects(importTransfer(db,bundle));
        assert.deepEqual(await db.query('SELECT * FROM work_line'), []);
        assert.deepEqual(await db.query('SELECT * FROM work_document'), []);
    } finally {await db.close();}
});
