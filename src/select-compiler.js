import {names} from './structures.js';
import {IDENT, q, record, columnName, tableSQL, tokens, split, projectionAlias, fieldReference} from './sql-expressions.js';
import {prepareParameters} from './sql-parameters.js';

// Portable subset of Python's legacy _to_text used by #ENV.
function environmentText(value) {
    if (Array.isArray(value)) return value.map(environmentText).join(',');
    if (value == null) return '';
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (typeof value === 'object') throw new Error('Valore #ENV non portabile');
    return String(value);
}

/** SQLite SELECT clauses ported from the hierarchical Python 0.6.1 compiler. */
class Context {
    constructor(tables, table, parameters, environment) {
        this.tables = tables; this.table = table; this.params = structuredClone(record(parameters ?? {}));
        this.environment = environment; this.joins = new Map(); this.active = new Set();
        this.formulaBindings = new Map(); this.bindingCounter = 0;
        this.bindingNames = new Set(Object.keys(this.params));
        this.resolvedColumns = new Map();
    }
    field(table, alias, name) {
        if (name === 'pkey') name = table.a.x_logical_pkey || table.a.pkey;
        const column = table.columns.get(name);
        if (column) return `${q(alias)}.${q(columnName(column))}`;
        const virtual = table.virtual.get(name) ?? table.composites.get(name);
        if (!virtual) throw new Error(`Colonna sconosciuta: ${table.key}.${name}`);
        const key = `${table.key}.${name}`;
        const resolvedKey = `${key}.${alias}`;
        if (this.resolvedColumns.has(resolvedKey)) return this.resolvedColumns.get(resolvedKey);
        if (this.active.has(key)) throw new Error(`Formula o alias ciclico: ${key}`);
        this.active.add(key);
        try {
            const remember = sql => { this.resolvedColumns.set(resolvedKey, sql); return sql; };
            if (virtual.a.relation_path) return remember(this.expression(/^[$@]/.test(virtual.a.relation_path) ? virtual.a.relation_path : '$' + virtual.a.relation_path, table, alias));
            if (virtual.tag === 'compositeColumn') return remember(`( ${this.expression(this.compositeFormula(table, virtual), table, alias)} )`);
            if (typeof virtual.a.sql_formula !== 'string' || virtual.children.length
                || Object.keys(virtual.a).some(k => /^(select|exists)(_|$)/.test(k)))
                throw new Error(`Formula con parametri, sottoquery o comportamento non supportato: ${key}`);
            let formula = virtual.a.sql_formula.replace(/#ENV\(([^,)]+)(,[^),]+)?\)/g, (_, name, fallback) => {
                const key = [name, fallback?.slice(1)].find(k => k != null && Object.hasOwn(this.environment, k));
                if (key == null) throw new Error(`${table.key}.${virtual.a.name}: #ENV(${name}) senza valore; callback env non supportate`);
                return `'${environmentText(this.environment[key]).replaceAll("'", "''")}'`;
            });
            // Bind the authored formula before expanding dependencies, each with its own scope.
            formula = this.bindFormula(formula, virtual, `${key}.${alias}`);
            formula = formula.replace(/#THIS\.([\w.@]+)/g, (_, path) => path.includes('.')
                ? this.related(path, table, alias) : this.field(table, alias, path));
            return remember(`( ${this.expression(formula, table, alias)} )`);
        } finally { this.active.delete(key); }
    }
    compositeFormula(table, column) {
        const chunks = names(column.a.columns).map(name => {
            const dtype = table.columns.get(name).a.dtype;
            if (['A', 'C', 'T'].includes(dtype)) return ` '"' ||  $${name} || '"' `;
            if (['L', 'F', 'R', 'B'].includes(dtype)) return `$${name}`;
            return ` '"' ||  $${name} || '::${dtype}"' `;
        });
        return "'[' || " + chunks.join(" ||', '||") + " || ']' ";
    }
    bindFormula(formula, column, key) {
        if (!this.formulaBindings.has(key)) {
            const values = {...(column.a.var_kwargs ?? {})};
            for (const [name, value] of Object.entries(column.a))
                if (name.startsWith('var_') && name !== 'var_kwargs') values[name.slice(4)] = value;
            const bindings = new Map();
            const entries = Object.entries(values);
            if (entries.length) {
                for (const [name] of entries) this.bindingNames.add(name);
                const namespace = `f${++this.bindingCounter}_`;
                for (const [name, value] of entries) {
                    let bound = namespace + name;
                    while (this.bindingNames.has(bound)) bound = '_' + bound;
                    this.bindingNames.add(bound);
                    bindings.set(name, {bound, value});
                }
            }
            this.formulaBindings.set(key, bindings);
        }
        const bindings = this.formulaBindings.get(key);
        // Same text substitution boundary as Python SqlBindings, including quoted literals.
        return formula.replace(/(:)(\w+)(\W|$)/g, (match, colon, name, suffix) => {
            const binding = bindings.get(name);
            if (!binding) return match;
            this.params[binding.bound] = structuredClone(binding.value);
            return colon + binding.bound + suffix;
        });
    }
    related(path, table, alias) {
        const parts = path.replaceAll('@', '').split('.');
        for (const name of parts.slice(0, -1)) {
            if (table.relations.get(name)?.kind === 'virtual') throw new Error('Navigazione virtualRelation fuori perimetro query');
            const owner = table.columns.get(name) || table.composites.get(name);
            const relation = owner?.children.find(n => n.tag === 'relation');
            if (!relation || relation.a.x_weak) throw new Error(`Relazione diretta non supportata: ${table.key}.${name}`);
            if (['join_on', 'cnd', 'between'].some(k => relation.a[k])) throw new Error('Condizione di relazione personalizzata non ancora supportata');
            const targetParts = relation.a.to.split('.'), target = this.tables.get(targetParts.slice(0, 2).join('.'));
            if (!target) throw new Error('Target della relazione sconosciuto');
            const remoteName = targetParts[2] ?? target.a.pkey;
            const remote = names(target.composites.get(remoteName)?.a.columns ?? remoteName);
            const local = owner.tag === 'column' ? [name] : names(owner.a.columns);
            if (local.length !== remote.length) throw new Error('Chiavi della relazione incompatibili');
            const key = `${alias}.${name}`;
            if (!this.joins.has(key)) {
                const targetAlias = `t${this.joins.size + 1}`;
                let condition = local.map((col, i) => `(${this.field(table, alias, col)})=${this.field(target, targetAlias, remote[i])}`).join(' AND ');
                if (relation.a.case_insensitive === 'Y') condition = `lower(${this.field(target, targetAlias, remote[0])}) = lower(${this.field(table, alias, local[0])})`;
                this.joins.set(key, {table: target, alias: targetAlias, condition});
            }
            alias = this.joins.get(key).alias; table = target;
        }
        return this.field(table, alias, parts.at(-1));
    }
    expression(text, table = this.table, alias = 't0') {
        split(text);
        this.resolveReferences([text], table, alias);
        // Python's legacy discover/substitute also resolves references inside SQL literals.
        const replaceFields = text => text.replace(new RegExp(`\\$(${IDENT})|@(${IDENT}(?:\\.@?${IDENT})+)`, 'g'),
            (_, field, path) => field ? this.field(table, alias, field) : this.related(path, table, alias));
        return tokens(text).map(token => {
            if (token.kind === 'field') throw new Error('Nomi logici quotati non supportati da Python 0.6.1');
            if (token.kind === 'protected') return replaceFields(token.text);
            if (/;|\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|ATTACH|DETACH|PRAGMA|WITH)\b/i.test(token.text))
                throw new Error('Sottoquery e statement nelle espressioni non ancora supportati');
            if (/#/.test(token.text)) throw new Error('Macro SQL non ancora supportata');
            return replaceFields(token.text).replace(/\bILIKE\b/gi, 'LIKE');
        }).join('');
    }
    resolveReferences(expressions, table = this.table, alias = 't0') {
        // Python discovers local fields before relation paths in each clause,
        // then resolves the combined ordered dictionary across all clauses.
        const refs = new Map();
        for (const text of expressions.filter(Boolean)) {
            for (const match of text.matchAll(new RegExp(`\\$(${IDENT})`, 'g')))
                refs.set(match[1], {field: match[1]});
            for (const match of text.matchAll(new RegExp(`@(${IDENT}(?:\\.@?${IDENT})+)`, 'g')))
                refs.set(('@' + match[1]).replace(/\W/g, '_'), {path: match[1]});
        }
        for (const ref of refs.values()) {
            if (ref.field) this.field(table, alias, ref.field);
            else this.related(ref.path, table, alias);
        }
    }
    expandColumns(columns, bagFields) {
        if (Array.isArray(columns)) columns = columns.join(',');
        if (typeof columns !== 'string' || !columns.trim()) throw new Error('SELECT richiede colonne');
        columns = columns.replaceAll('  ', ' ').replaceAll('\n', '').replaceAll(' as ', ' AS ').replaceAll(' ,', ',');
        return split(columns).flatMap(raw => {
            if (raw === '*') return [...this.table.columns].filter(([, c]) => bagFields || c.a.dtype !== 'X').map(([n]) => '$' + n)
                .concat([...this.table.virtual].filter(([, c]) => c.a.static).map(([n]) => '$' + n));
            if (raw.startsWith('*')) throw new Error('Wildcard avanzato non supportato');
            return [raw];
        }).join(',');
    }
    projections(columns, bagFields) {
        const expanded = split(this.expandColumns(columns, bagFields));
        const entries = new Map();
        for (const raw of expanded) {
            const [value, explicit] = projectionAlias(raw);
            const name = explicit ?? fieldReference(value) ?? value.replace(/\W/g, '_');
            const alias = explicit ? raw.slice(value.length).trim().replace(/^AS\s+/i, '') : q(/^\d/.test(name) ? '_' + name : name);
            entries.set(q(explicit ? alias : name), `${this.expression(value)} AS ${alias}`);
        }
        if (!entries.size) throw new Error('SELECT richiede colonne');
        return [...entries.values()].join(',\n');
    }
    policies(request, where) {
        const {exclude_draft = true, exclude_logical_deleted = true, ignore_partition = false, environment = {}} = request;
        if (typeof exclude_draft !== 'boolean' || typeof ignore_partition !== 'boolean' || ![true, false, 'mark'].includes(exclude_logical_deleted))
            throw new Error('Opzioni delle policy non valide');
        const conditions = where ? [where] : [];
        const partition = Object.keys(this.table.a).find(k => k.startsWith('partition_'));
        if (partition && !ignore_partition) {
            const path = this.table.a[partition];
            const field = partition.slice(10), current = `current_${path}`, allowed = `allowed_${path}`;
            if (environment[current]) conditions.push(`$${field} = :env_${current}`);
            else if (environment[allowed]?.length) conditions.push(`$${field} IS NULL OR $${field} IN :env_${allowed}`);
        }
        if (this.table.a.logicalDeletionField && exclude_logical_deleted === true) conditions.push(`$${this.table.a.logicalDeletionField} IS NULL`);
        if (this.table.a.draftField && exclude_draft) conditions.push(`$${this.table.a.draftField} IS NOT TRUE`);
        return conditions.map(c => `(${c})`).join(' AND ');
    }
}

export function compileSelect(tables, table, request) {
    const {limit, offset, distinct = false, bagFields = false, addPkeyColumn = false, for_update = false} = request;
    for (const [name, value] of Object.entries({bagFields, addPkeyColumn, for_update})) if (typeof value !== 'boolean') throw new Error(`${name} deve essere booleano`);
    if (for_update) throw new Error('Le letture con lock richiedono un ciclo transazionale esplicito, non ancora supportato');
    if (distinct != null && typeof distinct !== 'boolean') throw new Error('distinct deve essere booleano');
    for (const [name, value] of Object.entries({limit, offset})) if (value != null && (!Number.isSafeInteger(value) || value < 0)) throw new Error(`${name} deve essere un intero non negativo`);
    const context = new Context(tables, table, request.sqlparams, request.environment ?? {});
    const aggregate = Boolean(distinct || request.group_by), count = request.operation === 'count';
    const group = request.group_by === '*' ? null : request.group_by;
    let columns = request.columns ?? '*';
    let ordering = request.order_by ?? (!aggregate ? table.a.order_by : null);
    if (count) { ordering = null; columns = group || (distinct ? columns : 'count(*) AS "gnr_row_count"'); }
    else if (addPkeyColumn && table.a.pkey && !aggregate) columns += `,$${table.a.x_logical_pkey || table.a.pkey} AS "pkey"`;
    if (table.a.logicalDeletionField && request.exclude_logical_deleted === 'mark' && !aggregate && !count) columns += `,$${table.a.logicalDeletionField} AS "_isdeleted"`;
    // Field-valued WHERE parameters retain their original values in compiled kwargs, as in Python.
    let where = request.where;
    if (where) for (const [name, value] of Object.entries(context.params)) {
        if (/^[A-Za-z_]\w*$/.test(name) && typeof value === 'string' &&
            (value.startsWith('$') && (table.columns.has(value.slice(1)) || table.virtual.has(value.slice(1))) || value.startsWith('@')))
            where = where.replace(new RegExp(`:${name}(\\W|$)`, 'g'), (_, suffix) => value + suffix);
    }
    where = context.policies(request, where);
    columns = context.expandColumns(columns, bagFields);
    context.resolveReferences([columns, where, ordering, group, request.having]);
    const projected = context.projections(columns, bagFields);
    const clauses = [['WHERE', where], ['ORDER BY', ordering], ['GROUP BY', group], ['HAVING', request.having]];
    const resolved = new Map(clauses.map(([name, text]) => [name, text ? context.expression(text) : null]));
    let sql = `SELECT ${distinct ? 'DISTINCT ' : ''}${projected}\n FROM ${tableSQL(table)} AS "t0"`;
    for (const join of context.joins.values()) sql += `\n       LEFT JOIN ${tableSQL(join.table)} AS ${q(join.alias)} ON (${join.condition})`;
    for (const name of ['WHERE', 'GROUP BY', 'HAVING', 'ORDER BY']) if (resolved.get(name)) sql += `\n${name} ${resolved.get(name)}`;
    if (limit) sql += `\nLIMIT ${limit}`;
    else if (offset) sql += '\nLIMIT 9223372036854775807';
    if (offset) sql += `\nOFFSET ${offset}`;
    return prepareParameters(sql, context.params, request.environment);
}
