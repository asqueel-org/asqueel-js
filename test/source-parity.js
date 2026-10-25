// The recipe source compared with Python: the TYTX rows of the composed source.
// Attribute order is not part of the comparison; deepStrictEqual ignores key order.
import assert from 'node:assert/strict';
import {sourceRows} from '../src/source-bag.js';

export {sourceRows};

export function assertSameSource(builder, expected, message) {
    assert.deepEqual(sourceRows(builder.toTytx()), sourceRows(expected), message);
}
