import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {nativeSQLite} from './native-sqlite.js';

test('public native adapter persists, rolls back, binds values and closes safely', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'asqueel-js-adapter-'));
    const filename = join(directory, 'data.db');
    let db;
    try {
        db = nativeSQLite(filename);
        await db.execute('CREATE TABLE data (id INTEGER PRIMARY KEY, value TEXT)');
        await db.execute('INSERT INTO data VALUES (:id, :value)', {':id': 1, ':value': "O'Brien"});
        await db.execute('BEGIN');
        await db.execute('INSERT INTO data VALUES (?, ?)', [2, 'rollback']);
        await db.execute('ROLLBACK');
        await db.close();
        await db.close();
        await assert.rejects(db.query('SELECT 1'), /closed/);
        db = nativeSQLite(filename);
        assert.deepEqual(await db.query('SELECT * FROM data'), [{id: 1, value: "O'Brien"}]);
        assert.deepEqual(await db.query('SELECT typeof(:n) AS kind, CAST(:n AS TEXT) AS text', {':n': 2147483648}),
            [{kind: 'integer', text: '2147483648'}]);
        assert.deepEqual(await db.query('SELECT typeof(?) AS kind', [1]), [{kind: 'integer'}]);
        assert.deepEqual(await db.query('PRAGMA foreign_keys'), [{foreign_keys: 1}]);
    } finally {
        if (db) await db.close();
        await rm(directory, {recursive: true, force: true});
    }
});
