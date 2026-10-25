import {record} from './sql-expressions.js';
import {UnsupportedFeatureError} from './query-errors.js';

export function validateCompilerMethods(tables, methods) {
    for (const [table, handlers] of Object.entries(record(methods))) {
        if (!tables.has(table)) throw new Error(`Unknown callback table: ${table}`);
        for (const [name, method] of Object.entries(record(handlers)))
            if (!/^(sql_formula_|subquery_|env_|formulaColumn_).+/.test(name) || typeof method !== 'function')
                throw new TypeError(`Invalid compiler callback: ${table}.${name}`);
    }
}

/** Synchronous SqlTable compiler methods; functions never enter the model JSON. */
export class CompilerMethods {
    constructor(tables, methods, environment, cache = new Map()) {
        this.tables = tables; this.methods = methods; this.environment = environment;
        this.cache = cache; this.owners = new Map();
    }
    owner(table) {
        if (!this.owners.has(table.key)) {
            const owner = {fullname: table.key, name: table.a.name, db: {
                currentEnv: this.environment,
                table: name => {
                    const target = this.tables.get(name) ?? this.tables.get(`${table.namespace}.${name}`);
                    if (!target) throw new Error(`Unknown callback table: ${name}`);
                    return this.owner(target);
                },
            }};
            for (const name of Object.keys(this.methods[table.key] ?? {}))
                owner[name] = (...args) => this.call(table, name, ...args);
            this.owners.set(table.key, owner);
        }
        return this.owners.get(table.key);
    }
    call(table, name, ...args) {
        const method = this.methods[table.key]?.[name];
        if (typeof method !== 'function') throw new UnsupportedFeatureError(
            `${table.key}: ${name.startsWith('env_') ? `#ENV(${name.slice(4)}) ` : ''}missing callback ${name}`);
        const value = method.apply(this.owner(table), args);
        if (value != null && typeof value.then === 'function') {
            // An async handler is invalid even if it would resolve immediately.
            Promise.resolve(value).catch(() => {});
            throw new TypeError(`${table.key}.${name}: compilation requires synchronous callbacks`);
        }
        return value;
    }
    columns(table) {
        const names = Object.keys(this.methods[table.key] ?? {}).filter(n => n.startsWith('formulaColumn_')).sort();
        if (!names.length) return new Map();
        const key = '_virtual_columns_' + table.key.replaceAll('.', '_');
        if (!this.cache.has(key)) {
            const declarations = {};
            for (const method of names) {
                const result = this.call(table, method);
                for (const declaration of Array.isArray(result) ? result : [result]) {
                    const {name, ...attrs} = structuredClone(record(declaration));
                    if (typeof name !== 'string' || !name) throw new TypeError(`${method}: missing column name`);
                    if (table.columns.has(name) || table.virtual.has(name) || table.composites.has(name))
                        throw new Error(`${table.key}.${name}: ${method} redefines a declared column`);
                    Object.defineProperty(declarations, name, {value: attrs, enumerable: true, configurable: true});
                }
            }
            this.cache.set(key, declarations);
        }
        const declarations = structuredClone(this.cache.get(key));
        this.environment[key] = declarations;
        return new Map(Object.entries(declarations).map(([name, attrs]) => [name.toLowerCase(),
            {tag: 'formulaColumn', label: name, a: attrs, children: []}]));
    }
}
