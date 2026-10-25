// Port of asqueel.builder.SqlSourceBag: the recipe source class, registered as a
// TYTX subtype under the same name as Python, so a saved source decodes to it on both sides.
import {SourceBag} from '@genrojs/builders';
import {getSubtypeDict, setSubtypeDict} from '@genrojs/tytx';

export class SqlSourceBag extends SourceBag {}

if ((getSubtypeDict(SqlSourceBag.tytxSuffix).SqlSourceBag ?? SqlSourceBag) !== SqlSourceBag)
    throw new Error("TYTX subtype name 'SqlSourceBag' is already registered for another class");
setSubtypeDict(SqlSourceBag.tytxSuffix, {...getSubtypeDict(SqlSourceBag.tytxSuffix), SqlSourceBag});

/** The TYTX rows of a saved source, as compared with Python: attribute order is not part of them. */
export function sourceRows(text) {
    const match = /^([\s\S]*)::X$/.exec(text);
    if (!match) throw new Error('Expected a TYTX Bag payload');
    const payload = JSON.parse(match[1]);
    return {cls: payload.__cls ?? null, rows: payload.rows};
}
