import {scalar} from './sql-expressions.js';
import {parameterMatches, substituteParameters} from './parameter-tokens.js';

/** SQLite preparation ported from Python 0.7.0's adapter, including unused kwargs. */
export function prepareParameters(sql, values = {}, environment = {}) {
    const params = Object.assign(Object.create(null), structuredClone(values));
    sql = sql.replaceAll('\\:', '\x01');
    for (const match of parameterMatches(sql)) {
        const name = match.groups.parameter;
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
            sql = substituteParameters(sql, match => match.groups.parameter === name ? `(${slots.join(',')}) ` : match[0]);
        } else params[name] = scalar(typeof value === 'string' && /^\\[$@]/.test(value) ? value.slice(1) : value);
    }
    sql = sql.replace(/(\(*)(["\w]["\w.]*) +IS +(NOT +)?(TRUE|FALSE)/gi,
        (_, prefix, expression, not, truth) => `${prefix}(${expression} IS ${not ? '' : 'NOT '}NULL ${not ? 'OR' : 'AND'} ${expression} ${not ? '!=' : '='}${truth.toUpperCase() === 'TRUE' ? 1 : 0})`);
    return {sql: sql.replaceAll('\x01', ':'), params: structuredClone(params)};
}

/** Drivers only receive live placeholders; Python permits extra, unused kwargs. */
export function driverParameters({sql, params}) {
    const used = new Set([...parameterMatches(sql)].map(m => m.groups.parameter));
    return Object.fromEntries([...used].map(name => [`:${name}`, typeof params[name] === 'boolean' ? Number(params[name]) : params[name]]));
}
