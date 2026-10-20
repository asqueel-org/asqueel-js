import {DatabaseSync} from 'node:sqlite';
import {nativeAdapter} from './native-sqlite.js';

/** SQLite on Node >=22.13; synchronous driver behind the asynchronous adapter contract. */
export function openNodeSQLite(filename = ':memory:') {
    return nativeAdapter(new DatabaseSync(filename));
}
