import {scalar, tokens} from './sql-expressions.js';

/** SQLite preparation ported from Python 0.6.1's adapter, including unused kwargs. */
export function prepareParameters(sql, values = {}, environment = {}) {
    const params = Object.assign(Object.create(null), structuredClone(values));
    for (const match of sql.matchAll(/(?<!:):([A-Za-z_]\w*)/g)) {
        const name = match[1];
        if (!Object.hasOwn(params, name)) params[name] = name.startsWith('env_') ? environment[name.slice(4)] ?? null : null;
    }
    for (const [name, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
            if (!/^[A-Za-z_]\w*$/.test(name)) throw new Error('Nome del parametro collezione non valido');
            const slots = value.map((item, i) => {
                const key = `${name}${i}`;
                if (Object.hasOwn(params, key)) throw new Error(`Collisione nei parametri espansi: ${key}`);
                params[key] = scalar(item);
                return `:${key}`;
            });
            delete params[name];
            sql = sql.replace(new RegExp(`:${name}(\\W|$)`, 'g'), (_, suffix) => `(${slots.join(',')}) ${suffix}`);
        } else params[name] = scalar(typeof value === 'string' && /^\\[$@]/.test(value) ? value.slice(1) : value);
    }
    sql = sql.replace(/(\(*)(["\w]["\w.]*) +IS +(NOT +)?(TRUE|FALSE)/gi,
        (_, prefix, expression, not, truth) => `${prefix}(${expression} IS ${not ? '' : 'NOT '}NULL ${not ? 'OR' : 'AND'} ${expression} ${not ? '!=' : '='}${truth.toUpperCase() === 'TRUE' ? 1 : 0})`);
    return {sql, params: structuredClone(params)};
}

/** Drivers only receive live placeholders; Python permits extra, unused kwargs. */
export function driverParameters({sql, params}) {
    const used = new Set(tokens(sql).filter(t => t.kind === 'code').flatMap(t =>
        [...t.text.matchAll(/(?<!:):([A-Za-z_]\w*)/g)].map(m => m[1])));
    return Object.fromEntries([...used].map(name => [`:${name}`, typeof params[name] === 'boolean' ? Number(params[name]) : params[name]]));
}
