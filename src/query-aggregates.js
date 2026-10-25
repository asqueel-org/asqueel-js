import {split, projectionAlias, tokens} from './sql-expressions.js';
import {UnsupportedFeatureError} from './query-errors.js';
const resultName = value => value.replace(/\W/g, '_');
const columnExpression = value => /^[a-zA-Z_]\w*$/.test(value) && value.toUpperCase() !== 'NULL' ? '$' + value : value;

/** The agreed Python aggr() grammar; arguments remain model-aware SQL expressions. */
export function aggregateColumns(arguments_, path) {
    const result = [];
    for (const argument of arguments_) {
        const [raw, outer] = projectionAlias(argument);
        const call = /^(\w+)\s*\(([\s\S]*)\)$/.exec(raw.trim());
        if (!call) throw new Error('aggr requires aggregate functions');
        const fn = call[1].toLowerCase(), text = call[2].trim();
        if (!['count', 'sum', 'avg', 'min', 'max', 'join', 'to_json', 'to_xml'].includes(fn))
            throw new UnsupportedFeatureError(`Unsupported aggregation: ${fn}`);
        if (['to_json', 'to_xml'].includes(fn)) {
            result.push({columns: text || '*', name: outer ?? resultName(path + (text ? '_' + text.replace(/^\$/, '') : '') + '_' + fn.slice(3)), mode: fn});
        } else if (fn === 'count') {
            if (text) throw new UnsupportedFeatureError('aggr supports only count() without arguments');
            result.push({columns: 'COUNT(*)', name: outer ?? resultName(path + '_count')});
        } else {
            const values = split(text);
            if (fn === 'join') {
                if (![2, 3].includes(values.length)) throw new Error('join requires an expression, a separator and an optional placeholder');
                result.push({columns: `COALESCE(NULLIF(CAST(${columnExpression(values[0])} AS text), ''), ${values[2] ?? "''"}) AS value,${values[1]} AS separator`,
                    name: outer ?? resultName(path + '_' + values[0].replace(/^\$/, '') + '_join'), mode: 'join'});
            } else {
                if (outer && values.length !== 1) throw new Error('Use AS on every aggregate argument');
                for (const value of values) {
                    const [expression, alias] = projectionAlias(value);
                    if (outer && alias) throw new Error('Alias aggregato duplicato');
                    result.push({columns: `${fn.toUpperCase()}(${columnExpression(expression)})`, name: alias ?? outer ?? resultName(path + '_' + expression.replace(/^\$/, '') + '_' + fn)});
                }
            }
        }
    }
    if (!result.length) throw new Error('aggr requires at least one aggregation');
    return result;
}

export function callArguments(expression, start) {
    let depth = 1;
    for (const token of tokens(expression.slice(start))) if (token.kind === 'code') {
        for (let i = 0; i < token.text.length; i++) {
            if (token.text[i] === '(') depth++;
            if (token.text[i] === ')' && --depth === 0) {
                const end = start + token.start + i;
                const text = expression.slice(start, end).trim();
                return {arguments: text ? split(text) : [], end: end + 1};
            }
        }
    }
    throw new Error('Missing closing parenthesis in the aggregation');
}
