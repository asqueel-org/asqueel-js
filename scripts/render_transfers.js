import oracle from '../test/fixtures/transfers.json' with {type:'json'};
import {runTransfer} from '../test/transfer-runner.js';
const {openNodeSQLite} = globalThis.Bun ? {openNodeSQLite:(await import('../src/adapters/bun-sqlite.js')).openBunSQLite} : await import('../src/adapters/node-sqlite.js');
const results=[];
for (const entry of oracle) {
    const db=openNodeSQLite();
    try {const result=await runTransfer(db, entry);results.push({name:entry.name,bundle:result.bundle});}
    finally {await db.close();}
}
console.log(JSON.stringify(results));
