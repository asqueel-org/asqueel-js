import {Database} from 'bun:sqlite';
import {nativeAdapter} from './native-sqlite.js';

export function openBunSQLite(filename = ':memory:') {
    return nativeAdapter(new Database(filename));
}
