// Shared contract checks, executed on Node, Bun and the browser WASM adapter.
import {RecordNotFoundError, RecordMultipleRowsError, TransactionStateError} from '../src/index.js';
import {equal} from '../src/sqlite.js';

const check = (value, message) => { if (!value) throw new Error(message); };
async function rejected(action, kind) {
    try { await action(); } catch (error) {
        check(!kind || error instanceof kind, `Unexpected error: ${error}`);
        return;
    }
    throw new Error('Expected rejection');
}

export async function queryRuntimeChecks(queries) {
    const people = queries.table('notes.person');
    const selected = id => people.query({where: '$id=:id', sqlparams: {id}});
    let savedTx;
    const returned = await queries.transaction(async tx => {
        savedTx = tx;
        const input = {id: 900, name: 'Transaction'};
        check(await tx.table('notes.person').insert(input) === input, 'insert must return the input record');
        check(input.active === 1, 'insert must merge SQL defaults');
        const changed = {name: 'Updated', active: false};
        check(await tx.table('notes.person').update(changed, {pkey: 900}) === changed, 'update must return input');
        check((await tx.table('notes.person').query({where: '$id=900'}).fetchRecord()).name === 'Updated', 'read own write');
        await rejected(() => selected(900).fetch(), TransactionStateError);
        await rejected(() => tx.transaction(() => {}), TransactionStateError);
        return 'committed';
    });
    check(returned === 'committed', 'transaction callback result');
    check((await selected(900).fetchRecord()).active === 0, 'committed update missing');
    await rejected(() => savedTx.table('notes.person').query().fetch(), TransactionStateError);
    check(await selected(900).count() === 1 && await selected(900).exists(), 'count/exists');
    check(await selected(-900).fetchRecord(true) === null && !await selected(-900).exists(), 'missing optional record');
    await rejected(() => selected(-900).fetchRecord(), RecordNotFoundError);
    await people.insert({id: 901, name: 'Another'});
    await rejected(() => people.query({where: '$id>=900'}).fetchRecord(), RecordMultipleRowsError);
    check((await people.query({where: '$id>=900', order_by: '$id DESC'}).fetchRecord()).id === 901, 'ordered first record');
    check(await people.query({where: '$id>=900', group_by: '$active', columns: '$active'}).count() === 2, 'group count');
    check(await people.query({where: '$id>=900', distinct: true, columns: '$active'}).count() === 2, 'distinct count');
    // Catching a statement error in the callback must still roll back the unit of work.
    await rejected(() => queries.transaction(async tx => {
        await tx.table('notes.person').insert({id: 902, name: 'Must roll back'});
        await rejected(() => tx.table('notes.person').insert({id: 900, name: 'Duplicate'}));
    }));
    check(!await selected(902).exists(), 'failed transaction leaked a row');
    await rejected(() => queries.transaction(async tx => {
        await tx.table('notes.person').delete(900);
        throw new Error('callback failure');
    }));
    check(await selected(900).exists(), 'callback failure did not roll back');
    // Concurrent standalone writes are serialized, then a read observes both commits.
    await Promise.all([people.update({name: 'A'}, {pkey: 900}), people.update({name: 'B'}, {pkey: 901})]);
    check(equal(await people.query({columns: '$name', where: '$id>=900', order_by: '$id'}).fetch(),
        [{name: 'A'}, {name: 'B'}]), 'serialized updates');
    check(await people.delete(900) === undefined, 'delete return value');
    await people.delete({id: 901});
    check(await people.query({where: '$id>=900'}).count() === 0, 'delete/cleanup');
}
