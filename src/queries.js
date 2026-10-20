import {projectApplication} from './application.js';
import {names} from './structures.js';

const IDENT = '[A-Za-z_][A-Za-z0-9_]*';
const own = (o, k) => Object.hasOwn(o, k);
const q = value => {
    if (typeof value !== 'string' || !value || value.includes('\0')) throw new Error('Identificatore non valido');
    return `"${value.replaceAll('"', '""')}"`;
};
const scalar = value => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return value;
    throw new Error('Parametro non supportato: usare null, stringa, booleano o numero finito sicuro');
};
const record = value => {
    if (!value || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
        throw new Error('È richiesto un oggetto di attributi');
    }
    return value;
};
const columnName = c => c.a.sqlname || c.a.x_sql_name || c.a.name;
const tableSQL = t => `${q(t.sqlschema)}.${q(t.sqlname)}`;

// Preserve quoted SQL and comments. No parameter or model substitution ever
// takes place inside a protected token.
function tokens(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('Espressione SQL vuota');
    const out = [];
    for (let i = 0; i < text.length;) {
        const rest = text.slice(i);
        const pattern = /^(?:'(?:''|[^'])*'|"(?:\"\"|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)/;
        const quotedField = /^\$"((?:""|[^"])*)"/.exec(rest);
        if (quotedField) {
            out.push({kind: 'field', text: quotedField[0], field: quotedField[1].replaceAll('""', '"'), start: i});
            i += quotedField[0].length;
        } else {
            const protectedToken = pattern.exec(rest);
            if (protectedToken) {
                out.push({kind: 'protected', text: protectedToken[0], start: i});
                i += protectedToken[0].length;
            } else {
                if ("'\"`[".includes(text[i]) || rest.startsWith('/*')) throw new Error('Stringa o commento SQL non terminato');
                const previous = out.at(-1);
                if (previous?.kind === 'code') previous.text += text[i];
                else out.push({kind: 'code', text: text[i], start: i});
                i++;
            }
        }
    }
    return out;
}
function split(text) {
    const result = [], source = tokens(text);
    let depth = 0, start = 0;
    for (const token of source) if (token.kind === 'code') {
        for (let i = 0; i < token.text.length; i++) {
            const ch = token.text[i], position = token.start + i;
            if (ch === '(') depth++;
            if (ch === ')' && --depth < 0) throw new Error('Parentesi SQL non bilanciate');
            if (ch === ',' && !depth) { result.push(text.slice(start, position).trim()); start = position + 1; }
        }
    }
    if (depth) throw new Error('Parentesi SQL non bilanciate');
    result.push(text.slice(start).trim());
    if (result.some(s => !s)) throw new Error('Espressione vuota');
    return result;
}
function projectionAlias(text) {
    let depth = 0, found = null;
    for (const token of tokens(text)) if (token.kind === 'code') {
        for (let i = 0; i < token.text.length; i++) {
            if (token.text[i] === '(') depth++;
            else if (token.text[i] === ')') depth--;
            else if (!depth && /^AS\b/i.test(token.text.slice(i)) && (i === 0 || /\s/.test(token.text[i - 1]))) found = token.start + i;
        }
    }
    if (found == null) return [text, null];
    const alias = text.slice(found + 2).trim();
    if (new RegExp(`^${IDENT}$`).test(alias)) return [text.slice(0, found).trim(), alias];
    if (/^"(?:\"\"|[^"])*"$/.test(alias)) return [text.slice(0, found).trim(), alias.slice(1, -1).replaceAll('""', '"')];
    throw new Error('Alias di proiezione non valido');
}
const fieldReference = text => {
    const simple = new RegExp(`^\\$(${IDENT})$`).exec(text);
    if (simple) return simple[1];
    const quoted = /^\$"((?:""|[^"])*)"$/.exec(text);
    return quoted ? quoted[1].replaceAll('""', '"') : null;
};
const pathReference = text => new RegExp(`^@(${IDENT}(?:\\.@?${IDENT})+)`).exec(text);

class Context {
    constructor(tables, table, parameters, insert) {
        this.tables = tables; this.table = table; this.insert = insert;
        this.available = record(parameters || {}); this.params = Object.create(null); this.used = new Set(Object.keys(this.available));
        this.uses = new Map(); this.joins = new Map();
    }
    field(table, alias, name) {
        const column = table.columns.get(name);
        if (!column) throw new Error(`Campo fisico sconosciuto: ${table.key}.${name}`);
        if (table.virtual.has(name)) throw new Error('Colonne virtuali fuori perimetro query');
        return `${this.insert ? '' : q(alias) + '.'}${q(columnName(column))}`;
    }
    related(path) {
        if (this.insert) throw new Error('Relazioni in RETURNING fuori perimetro');
        const parts = path.replaceAll('@', '').split('.');
        let table = this.table, alias = 't0';
        for (const name of parts.slice(0, -1)) {
            const owner = table.columns.get(name) || table.composites.get(name);
            const relation = owner?.children.find(n => n.tag === 'relation');
            if (!relation || relation.a.x_weak) throw new Error(`Relazione diretta non supportata: ${table.key}.${name}`);
            const targetParts = relation.a.to.split('.');
            const target = this.tables.get(targetParts.slice(0, 2).join('.'));
            if (!target) throw new Error('Target della relazione sconosciuto');
            const remote = targetParts.length === 2 ? names(target.a.pkey)
                : target.composites.has(targetParts[2]) ? names(target.composites.get(targetParts[2]).a.columns) : [targetParts[2]];
            const local = owner.tag === 'column' ? [name] : names(owner.a.columns);
            if (local.length !== remote.length) throw new Error('Chiavi della relazione incompatibili');
            const key = `${alias}.${name}`;
            if (!this.joins.has(key)) {
                const targetAlias = `t${this.joins.size + 1}`;
                const condition = local.map((col, i) => `${this.field(table, alias, col)} = ${this.field(target, targetAlias, remote[i])}`).join(' AND ');
                this.joins.set(key, {table: target, alias: targetAlias, condition});
            }
            alias = this.joins.get(key).alias;
            table = target;
        }
        return this.field(table, alias, parts.at(-1));
    }
    bind(name, collection, negated = false) {
        if (!own(this.available, name)) throw new Error(`Parametro mancante: ${name}`);
        if (this.uses.has(name) && this.uses.get(name) !== collection) throw new Error(`Parametro usato come scalare e collezione: ${name}`);
        this.uses.set(name, collection);
        if (!collection) {
            this.params[name] = scalar(this.available[name]);
            return `:${name}`;
        }
        const values = this.available[name];
        if (!Array.isArray(values)) throw new Error(`IN richiede una lista: ${name}`);
        if (!values.length) return `${negated ? 'NOT ' : ''}IN (SELECT 1 WHERE 0)`;
        const slots = values.map(value => {
            let i = 0;
            while (this.used.has(`${name}_${i}`)) i++;
            const slot = `${name}_${i}`;
            this.used.add(slot); this.params[slot] = scalar(value);
            return `:${slot}`;
        });
        return `${negated ? 'NOT ' : ''}IN (${slots.join(', ')})`;
    }
    expression(text) {
        split(text); // balanced parentheses before rendering
        return tokens(text).map(token => {
            if (token.kind === 'field') return this.field(this.table, 't0', token.field);
            if (token.kind === 'protected') return token.text;
            const code = token.text;
            if (/;|\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|ATTACH|DETACH|PRAGMA|WITH|ILIKE)\b/i.test(code)) {
                throw new Error('Sottoquery, statement e ILIKE fuori perimetro query');
            }
            let out = '';
            for (let i = 0; i < code.length;) {
                const rest = code.slice(i);
                let match;
                if ((match = /^(NOT\s+)?IN\s+:([A-Za-z_][A-Za-z0-9_]*)\b/i.exec(rest))
                    && (i === 0 || !/\w/.test(code[i - 1]))) {
                    out += this.bind(match[2], true, !!match[1]); i += match[0].length;
                } else if ((match = new RegExp(`^\\$(${IDENT})`).exec(rest))) {
                    out += this.field(this.table, 't0', match[1]); i += match[0].length;
                } else if ((match = pathReference(rest))) {
                    out += this.related(match[1]); i += match[0].length;
                } else if ((match = new RegExp(`^:(${IDENT})`).exec(rest))) {
                    out += this.bind(match[1], false); i += match[0].length;
                } else {
                    if ('$@:#?'.includes(code[i])) throw new Error('Sintassi espressione fuori perimetro');
                    out += code[i++];
                }
            }
            return out;
        }).join('');
    }
    projections(columns) {
        if (columns === null) return [];
        const expressions = typeof columns === 'string' ? split(columns) : columns;
        if (!Array.isArray(expressions) || !expressions.length) throw new Error('Specificare le colonne');
        const expanded = expressions.flatMap(s => s.trim() === '*' ? [...this.table.columns.keys()].map(n => `$${q(n)}`) : [s]);
        const aliases = new Set();
        return expanded.map(raw => {
            const [value, explicit] = projectionAlias(raw.trim());
            const field = fieldReference(value);
            const path = pathReference(value);
            const alias = explicit || field || (path?.[0] === value ? path[1].replaceAll('@', '').replaceAll('.', '_') : null);
            if (!alias) throw new Error('Le espressioni calcolate richiedono AS alias');
            if (aliases.has(alias)) throw new Error(`Alias duplicato: ${alias}`);
            aliases.add(alias);
            return `${this.expression(value)} AS ${q(alias)}`;
        });
    }
}

/** Data-only source for worker-side compilation; no user code crosses the worker. */
export function querySource(builder) {
    const visit = bag => bag.getNodes().map(n => ({tag: n.nodeTag,
        attributes: Object.fromEntries(Object.entries(n.getAttr()).filter(([k]) => k !== '_meta')),
        children: n.value?.getNodes ? visit(n.value) : []}));
    return structuredClone(visit(builder.source));
}
export function modelFromQuerySource(source, Builder) {
    const model = new Builder();
    const visit = (parent, nodes) => {
        for (const node of nodes) {
            if (!own(model.schema, node.tag)) throw new Error('Elemento del modello sconosciuto');
            const child = parent[node.tag](node.attributes);
            visit(child, node.children);
        }
    };
    visit(model.root, source);
    return model;
}

export class SqliteQueries {
    constructor(builder, adapter = null) {
        // Reuse the migration resolver for option expansion, types, references
        // and logical-to-physical naming; never infer logical names from SQL names.
        builder.toMigration();
        this.tables = projectApplication(builder, builder.constructor, {withModel: true}).tables;
        this.adapter = adapter;
    }
    resolveTable(name, write) {
        let table = this.tables.get(name);
        if (!table) {
            const matches = [...this.tables.values()].filter(t => t.a.name === name);
            if (matches.length === 1) table = matches[0];
        }
        if (!table) throw new Error(`Tabella sconosciuta o ambigua: ${name}`);
        if ([...table.options.values()].some(o => o.spec.enabled !== false)) {
            throw new Error(`${name}: hook/opzioni applicative fuori perimetro query${write ? ' (blocco anche in Python)' : ''}`);
        }
        for (const c of table.columns.values()) {
            if (['X', 'Z', 'P'].includes(c.a.dtype)) throw new Error('Codec applicativi fuori perimetro query');
            if (write && (c.children.some(n => n.tag !== 'relation') ||
                ['default', 'default_from', 'sql_value', 'x_generation', 'read_only', 'unmodifiable']
                    .some(k => c.a[k] != null && c.a[k] !== false))) throw new Error(`${name}: comportamento di scrittura non implementato`);
        }
        if (write && [...table.columns.values()].some(c => c.children.some(n =>
            Object.keys(n.a).some(k => k.startsWith('x_app_'))))) throw new Error('Hook di relazione non implementati');
        return table;
    }
    compile(request) {
        record(request);
        const insert = request.operation === 'insert';
        if (!insert && request.operation !== 'select') throw new Error('Supportati INSERT e SELECT');
        const allowed = insert ? ['operation', 'table', 'values', 'returning']
            : ['operation', 'table', 'columns', 'where', 'sqlparams', 'order_by', 'limit', 'offset'];
        for (const k of Object.keys(request)) if (!allowed.includes(k)) throw new Error(`Opzione query fuori perimetro: ${k}`);
        const table = this.resolveTable(request.table, insert);
        const context = new Context(this.tables, table, insert ? {} : request.sqlparams, insert);
        let sql;
        if (insert) {
            const assignments = Object.entries(record(request.values)).map(([name, value], i) => {
                const c = table.columns.get(name);
                if (!c) throw new Error(`Campo fisico sconosciuto: ${name}`);
                const parameter = `__value_${i}`;
                context.params[parameter] = scalar(value);
                return {column: q(columnName(c)), parameter: `:${parameter}`};
            });
            sql = `INSERT INTO ${tableSQL(table)} AS "t0"`;
            sql += assignments.length ? ` (${assignments.map(a => a.column).join(', ')}) VALUES (${assignments.map(a => a.parameter).join(', ')})` : ' DEFAULT VALUES';
            const returning = context.projections(own(request, 'returning') ? request.returning : '*');
            if (returning.length) sql += `\nRETURNING ${returning.join(',\n')}`;
        } else {
            const projections = context.projections(own(request, 'columns') ? request.columns : '*');
            if (!projections.length) throw new Error('SELECT richiede colonne');
            const where = request.where == null ? null : context.expression(request.where);
            const ordering = request.order_by == null ? null : context.expression(request.order_by);
            sql = `SELECT ${projections.join(',\n')}\n FROM ${tableSQL(table)} AS "t0"`;
            for (const join of context.joins.values()) sql += `\n LEFT JOIN ${tableSQL(join.table)} AS ${q(join.alias)} ON ${join.condition}`;
            if (where != null) sql += `\nWHERE ${where}`;
            if (ordering != null) sql += `\nORDER BY ${ordering}`;
            for (const key of ['limit', 'offset']) {
                const value = request[key];
                if (value != null && (!Number.isSafeInteger(value) || value < 0)) throw new Error(`${key} deve essere un intero non negativo`);
            }
            if (request.limit != null) sql += `\nLIMIT ${request.limit}`;
            else if (request.offset != null) sql += '\nLIMIT 9223372036854775807';
            if (request.offset != null) sql += `\nOFFSET ${request.offset}`;
        }
        return {sql, params: structuredClone(context.params)};
    }
    async execute(request) {
        const compiled = this.compile(request);
        if (!this.adapter) throw new Error('Adapter non collegato');
        // Driver boundary: wa-sqlite requires prefix-bearing binding keys;
        // all adapters receive the same canonical compiled SQL/params above.
        const params = Object.fromEntries(Object.entries(compiled.params).map(([k, v]) =>
            [`:${k}`, typeof v === 'boolean' ? Number(v) : v]));
        if (request.operation === 'select') return this.adapter.query(compiled.sql, params);
        await this.adapter.execute('BEGIN IMMEDIATE');
        try {
            const rows = await this.adapter.query(compiled.sql, params);
            await this.adapter.execute('COMMIT');
            return rows;
        } catch (e) { await this.adapter.execute('ROLLBACK'); throw e; }
    }
    table(name) {
        this.resolveTable(name, false);
        return {
            insert: (values, {returning = '*'} = {}) => this.execute({operation: 'insert', table: name, values, returning}),
            query: (options = {}) => {
                const request = structuredClone({...options, operation: 'select', table: name});
                return {compiled: this.compile(request), fetch: () => this.execute(request)};
            },
        };
    }
}
