import {PeriodMacro} from './period-macro.js';
import {expandTemplates, expandInRange} from './query-macros.js';
import {CompilerMethods} from './compiler-methods.js';
import {names} from './structures.js';
import {IDENT, q, record, columnName, tableSQL, tokens, split, projectionAlias, fieldReference} from './sql-expressions.js';
import {prepareParameters} from './sql-parameters.js';
import {QueryBindings} from './query-bindings.js';
import {aggregateColumns, callArguments} from './query-aggregates.js';
import {UnsupportedFeatureError} from './query-errors.js';

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
    constructor(tables, table, parameters, environment, parent = null, aliasPrefix = 't', bindings = null, methods = null, parseDateExpression = null) {
        this.tables = tables; this.table = table; this.environment = environment;
        this.bindings = bindings ?? new QueryBindings(record(parameters ?? {}));
        this.params = this.bindings.params;
        this.parseDateExpression = parent?.parseDateExpression ?? parseDateExpression;
        this.period = new PeriodMacro(this.bindings, environment, this.parseDateExpression);
        this.parent = parent; this.aliasPrefix = aliasPrefix; this.baseAlias = aliasPrefix + '0';
        this.joins = new Map(); this.active = parent?.active ?? new Set();
        this.formulaBindings = new Map(); this.manyColumns = new Map();
        this.fragments = parent?.fragments ?? [];
        this.methods = parent?.methods ?? methods ?? new CompilerMethods(tables, {}, environment);
        this.definitions = parent?.definitions ?? new Map();
    }
    protect(sql) {
        const index = this.fragments.push(sql) - 1;
        return `\u0000${index}\u0000`;
    }
    restore(sql) { return sql.replace(/\u0000(\d+)\u0000/g, (_, i) => this.restore(this.fragments[Number(i)])); }
    thisFields(text, table, alias) {
        return text.replace(/#THIS\.([\w.@]+)/g, (_, path) => this.protect(path.includes('.')
            ? this.related(path, table, alias) : this.field(table, alias, path)));
    }
    field(table, alias, name) {
        if (this.manyColumns.has(name) && table === this.table) return this.compileMany(this.manyColumns.get(name));
        if (name === 'pkey') name = table.a.pkey;
        // Python getFieldAlias reads virtual_columns first: the formulaColumn_<x>() objects are built here.
        const dynamic = this.methods.columns(table);
        const column = table.columns.get(name);
        if (column) return `${q(alias)}.${q(columnName(column))}`;
        const virtual = table.virtual.get(name) ?? table.composites.get(name) ?? dynamic.get(name.toLowerCase());
        if (!virtual) throw new Error(`Colonna sconosciuta: ${table.key}.${name}`);
        const key = `${table.key}.${name}`;
        if (this.active.has(key)) throw new Error(`Formula o alias ciclico: ${key}`);
        this.active.add(key);
        try {
            if (virtual.a.relation_path) return this.expression(/^[$@]/.test(virtual.a.relation_path) ? virtual.a.relation_path : '$' + virtual.a.relation_path, table, alias);
            if (virtual.tag === 'compositeColumn') return `( ${this.expression(this.compositeFormula(table, virtual), table, alias)} )`;
            return this.formula(table, virtual, alias);
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
    formulaScope(column, key) {
        if (!this.formulaBindings.has(key)) {
            const values = {...record(column.a.var_kwargs ?? {})};
            for (const [name, value] of Object.entries(column.a))
                if (name.startsWith('var_') && name !== 'var_kwargs') values[name.slice(4)] = value;
            for (const name of Object.keys(values)) if (!/^[A-Za-z_]\w*$/.test(name)) throw new Error('Nome parametro formula non valido');
            this.formulaBindings.set(key, Object.keys(values).length ? this.bindings.child(values, 'f') : this.bindings);
        }
        return this.formulaBindings.get(key);
    }
    formula(table, column, alias) {
        const key = `${table.key}.${column.label}`;
        if (!this.definitions.has(key)) {
            const attrs = structuredClone(column.a);
            if (column.tag === 'formulaColumn' && attrs.sql_formula === true) {
                const sql = this.methods.call(table, 'sql_formula_' + column.label, attrs);
                if (typeof sql !== 'string' || !sql.trim()) throw new TypeError(`${key}: la callback deve restituire SQL non vuoto`);
                attrs.sql_formula = sql;
            }
            if (column.tag === 'formulaColumn') {
                if ([attrs.sql_formula, attrs.select, attrs.exists].filter(v => v != null).length !== 1)
                    throw new Error(`${key}: specificare una sola formula, select o exists`);
                const found = new Set();
                const validateSubquery = value => {
                    if (typeof value === 'string' && value.trim()) return;
                    record(value);
                    for (const name of ['table', 'where']) if (typeof value[name] !== 'string' || !value[name].trim())
                        throw new Error(`${key}: sottoquery senza ${name}`);
                };
                for (const name of ['select', 'exists']) if (attrs[name] != null) validateSubquery(attrs[name]);
                for (const [name, value] of Object.entries(attrs)) {
                    if (!/^(select_|exists_)/.test(name)) continue;
                    const token = name.slice(name.indexOf('_') + 1);
                    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    if (found.has(token) || typeof attrs.sql_formula !== 'string' || !new RegExp('#' + escaped + '\\b').test(attrs.sql_formula))
                        throw new Error(`${key}: sottoquery duplicata o non usata: ${token}`);
                    found.add(token); validateSubquery(value);
                }
            }
            this.definitions.set(key, attrs);
        }
        const attrs = this.definitions.get(key), bindings = this.formulaScope({a: attrs}, `${key}.${alias}`);
        let formula = attrs.sql_formula, mode, definition = attrs.select ?? attrs.exists;
        const isExists = attrs.exists != null;
        if (column.tag === 'subQueryColumn') {
            mode = attrs.mode;
            if (mode != null && !['json', 'xml'].includes(mode)) throw new Error('subQueryColumn: usare aggr per questo tipo di aggregazione');
            definition = structuredClone(attrs.query);
            if (attrs.aggr != null) {
                if (mode != null) throw new Error('subQueryColumn: aggr e mode sono alternativi');
                const aggregates = aggregateColumns(split(attrs.aggr), `${table.key}.${column.label}`);
                if (aggregates.length !== 1) throw new Error('subQueryColumn richiede una sola aggregazione');
                definition = {...record(definition), columns: aggregates[0].columns};
                mode = aggregates[0].mode;
            }
        }
        const subqueries = new Map();
        if (definition != null) { formula = '#default'; subqueries.set('default', {definition, exists: isExists}); }
        else {
            if (typeof formula !== 'string' || column.children.length) throw new UnsupportedFeatureError('Formula richiede SQL valido');
            for (const prefix of ['select_', 'exists_']) for (const [key, value] of Object.entries(attrs))
                if (key.startsWith(prefix)) subqueries.set(key.slice(prefix.length), {definition: value, exists: prefix === 'exists_'});
        }
        if (column.tag === 'formulaColumn') formula = formula.replace(/#ENV\(([^,)]+)(,[^),]+)?\)/g, (_, name, fallback) => {
            const key = [name, fallback?.slice(1)].find(k => k != null && Object.hasOwn(this.environment, k));
            if (key == null) {
                const owner = fallback ? this.knownTable(fallback.slice(1), this.table, '#ENV') : table;
                const sql = this.methods.call(owner, 'env_' + name);
                if (typeof sql !== 'string') throw new TypeError('La callback env deve restituire SQL');
                return sql;
            }
            return `'${environmentText(this.environment[key]).replaceAll("'", "''")}'`;
        });
        formula = this.expandMany(expandTemplates(formula), table, false);
        formula = bindings.substitute(formula);
        for (const [name, sub] of subqueries) {
            let sql = this.subquery(sub.definition, table, alias, bindings, sub.exists, mode);
            if (sub.exists) sql = 'EXISTS ' + sql;
            const token = this.protect(sql);
            formula = formula.replace(new RegExp('#' + name + '\\b', 'g'), () => token);
        }
        formula = expandInRange(this.thisFields(formula, table, alias));
        return `( ${this.expression(formula, table, alias)} )`;
    }
    knownTable(name, owner = this.table, context = 'sottoquery') {
        const table = this.tables.get(name) ?? this.tables.get(`${owner.namespace}.${name}`);
        if (!table) throw new Error(`Tabella ${context} sconosciuta: ${name}`);
        return table;
    }
    subquery(definition, owner, alias, bindings, exists = false, mode = null) {
        if (typeof definition === 'string') definition = this.methods.call(this.table, 'subquery_' + definition);
        const options = structuredClone(record(definition));
        for (const [old, name] of [['excludeDraft', 'exclude_draft'], ['excludeLogicalDeleted', 'exclude_logical_deleted'], ['ignorePartition', 'ignore_partition']]) {
            if (Object.hasOwn(options, old)) {
                if (Object.hasOwn(options, name)) throw new Error(`Opzioni sottoquery in conflitto: ${old}, ${name}`);
                options[name] = options[old]; delete options[old];
            }
        }
        for (const [name, value] of [['subtable', '*'], ['addPkeyColumn', false], ['ignoreTableOrderBy', true]]) {
            if (Object.hasOwn(options, name) && options[name] !== value) throw new UnsupportedFeatureError(`Opzione sottoquery non supportata: ${name}`);
            delete options[name];
        }
        const allowed = ['table', 'where', 'columns', 'sqlparams', 'cast', 'order_by', 'limit', 'offset', 'distinct', 'group_by', 'having', 'bagFields', 'exclude_draft', 'exclude_logical_deleted', 'ignore_partition'];
        for (const name of Object.keys(options)) if (!allowed.includes(name)) throw new UnsupportedFeatureError(`Opzione sottoquery non supportata: ${name}`);
        if (exists && Object.hasOwn(options, 'cast')) throw new UnsupportedFeatureError('CAST non applicabile a EXISTS');
        const table = this.knownTable(options.table, owner);
        if (typeof options.where !== 'string' || !options.where.trim()) throw new Error('La sottoquery richiede where');
        const where = this.thisFields(options.where, owner, alias);
        const child = new Context(this.tables, table, null, this.environment, this, alias + '_t', bindings.child(options.sqlparams, 's'));
        const request = {exclude_draft: false, exclude_logical_deleted: false, ignore_partition: true,
            ...options, columns: options.columns ?? (exists ? '1' : '*'), where, environment: this.environment};
        const plan = selectPlan(child, request), sql = plan.sql;
        const row = q(child.baseAlias + '_rows');
        if (mode === 'join') return `(SELECT COALESCE(group_concat(${row}.value, ${row}.separator), '') FROM (${sql}) AS ${row})`;
        if (mode === 'to_json') {
            const fields = split(plan.projected).flatMap(column => {
                const [expression, name] = projectionAlias(column), field = name ?? expression;
                return ["'" + field.replaceAll("'", "''") + "'", row + '.' + q(field)];
            });
            return `(SELECT json_group_array(json_object(${fields.join(', ')})) FROM (${sql}) AS ${row})`;
        }
        if (mode != null) throw new UnsupportedFeatureError(`SQLite non supporta subQueryColumn/aggr mode=${mode}`);
        if (!exists && split(plan.columns).length !== 1) throw new Error('La sottoquery scalare richiede esattamente una colonna');
        return options.cast ? ` CAST( ( ${sql} ) AS ${options.cast}) ` : ` ( ${sql} ) `;
    }
    expandMany(expression, table = this.table, projection = false) {
        if (!expression) return expression;
        for (const match of expression.matchAll(/(@\w+(?:\.@?\w+)*)\.(\w+)\s*\(/g)) {
            let owner = table, relation;
            const parts = match[1].replaceAll('@', '').split('.');
            for (let i = 0; i < parts.length; i++) {
                relation = owner.relations.get(parts[i]);
                if (!relation) break;
                const many = relation.kind === 'virtual' || (relation.joiner.mode !== 'O' && !relation.joiner.one_one);
                if (many && i < parts.length - 1) throw new UnsupportedFeatureError('Navigazione attraverso una relazione molti non supportata');
                if (i < parts.length - 1) owner = this.knownTable(relation.joiner.one_relation.split('.').slice(0, 2).join('.'));
            }
            if (!relation || (relation.kind !== 'virtual' && (relation.joiner.mode === 'O' || relation.joiner.one_one))) continue;
            let operation = match[2], parsed = callArguments(expression, match.index + match[0].length), ordering;
            if (operation === 'order_by') {
                if (parsed.arguments.length !== 1 || !/^(['"])[\s\S]*\1$/.test(parsed.arguments[0])) throw new Error('order_by richiede una stringa quotata');
                const text = parsed.arguments[0], quote = text[0];
                ordering = text.slice(1, -1).replaceAll(quote + quote, quote);
                const next = /^\s*\.aggr\s*\(/.exec(expression.slice(parsed.end));
                if (!next) throw new UnsupportedFeatureError('order_by deve essere seguito da aggr');
                parsed = callArguments(expression, parsed.end + next[0].length); operation = 'aggr';
            }
            if (operation !== 'aggr') throw new UnsupportedFeatureError(`Operazione molti non supportata: ${operation}`);
            if (!projection) throw new UnsupportedFeatureError('aggr è supportata solo nelle proiezioni');
            if (expression.slice(0, match.index).trim() || expression.slice(parsed.end).trim()) throw new UnsupportedFeatureError('aggr richiede una proiezione autonoma');
            return aggregateColumns(parsed.arguments, match[1]).map(aggregate => {
                let token = `_many_${this.manyColumns.size}`;
                while (this.table.columns.has(token) || this.table.virtual.has(token) || this.manyColumns.has(token)) token = '_' + token;
                this.manyColumns.set(token, {table, path: parts, aggregate, ordering});
                return `$${token} AS ${q(aggregate.name)}`;
            }).join(',');
        }
        return expression;
    }
    compileMany({table, path, aggregate, ordering}) {
        let alias = this.baseAlias;
        if (path.length > 1) ({table, alias} = this.related(path.slice(0, -1).join('.'), table, alias, true));
        let relation = table.relations.get(path.at(-1));
        const conditions = [], visited = new Set();
        while (relation.kind === 'virtual') {
            const attrs = relation.a, key = `${table.key}.${attrs.name}`;
            if (visited.has(key)) throw new Error(`Relazione virtuale ciclica: ${key}`);
            visited.add(key);
            if (attrs.ask) throw new UnsupportedFeatureError('Aggregazioni virtuali con ask non supportate');
            if (attrs.condition) {
                const values = Object.fromEntries(Object.entries(attrs).filter(([name]) => name.startsWith('var_') && new RegExp(':' + name + '\\b').test(attrs.condition)));
                const scope = Object.keys(values).length ? this.bindings.child(values, 'v') : this.bindings;
                let condition = scope.substitute(attrs.condition);
                for (const [name, expression] of Object.entries(values)) {
                    const sql = this.bindings.substitute(this.expression(expression, table, alias));
                    condition = condition.replace(new RegExp(':' + scope.names.get(name) + '\\b', 'g'), () => this.protect(`(${sql})`));
                    delete this.params[scope.names.get(name)];
                }
                conditions.push(condition);
            }
            if (attrs.table) {
                if (!attrs.condition?.trim()) throw new Error('virtualRelation table richiede condition');
                break;
            }
            if (!attrs.relation) throw new UnsupportedFeatureError('Relazione virtuale senza origine');
            const parts = attrs.relation.replaceAll('@', '').split('.');
            if (parts.length > 1) ({table, alias} = this.related(parts.slice(0, -1).join('.'), table, alias, true));
            relation = table.relations.get(parts.at(-1));
            if (!relation) throw new Error('Relazione virtuale di origine sconosciuta');
        }
        conditions.reverse();
        let target, where;
        if (relation.kind === 'virtual') {
            target = this.knownTable(relation.a.table, table);
            where = conditions.map(c => `(${c})`).join(' AND ');
        } else {
            const joiner = relation.joiner;
            if (joiner.mode === 'O' || joiner.one_one) throw new UnsupportedFeatureError('aggr richiede una relazione molti');
            if (['join_on', 'cnd', 'between'].some(key => joiner[key])) throw new UnsupportedFeatureError('aggr con condizione di join personalizzata non supportata');
            const remote = joiner.many_relation.split('.'), local = joiner.one_relation.split('.');
            target = this.knownTable(remote.slice(0, 2).join('.'));
            const owner = this.knownTable(local.slice(0, 2).join('.'));
            const left = names(target.composites.get(remote[2])?.a.columns ?? remote[2]);
            const right = names(owner.composites.get(local[2])?.a.columns ?? local[2]);
            if (left.length !== right.length) throw new Error('Componenti relazione incompatibili');
            where = left.map((name, i) => joiner.case_insensitive === 'Y' ? `lower($${name})=lower(#THIS.${right[i]})` : `$${name}=#THIS.${right[i]}`).join(' AND ');
            if (conditions.length) where = [where, ...conditions].map(c => `(${c})`).join(' AND ');
        }
        const definition = {table: target.key, columns: aggregate.columns, where};
        if (['join', 'to_json', 'to_xml'].includes(aggregate.mode)) definition.order_by = ordering ?? target.a.order_by;
        return this.subquery(definition, table, alias, this.bindings, false, aggregate.mode);
    }
    related(path, table, alias, returnTarget = false) {
        const parts = path.replaceAll('@', '').split('.');
        for (const name of (returnTarget ? parts : parts.slice(0, -1))) {
            if (table.relations.get(name)?.kind === 'virtual') throw new Error('Navigazione virtualRelation fuori perimetro query');
            const owner = table.columns.get(name) || table.composites.get(name);
            const relation = owner?.children.find(n => n.tag === 'relation');
            if (!relation) throw new Error(`Relazione diretta non supportata: ${table.key}.${name}`);
            if (['join_on', 'cnd', 'between'].some(k => relation.a[k])) throw new Error('Condizione di relazione personalizzata non ancora supportata');
            const targetParts = relation.a.related_column.split('.'), target = this.tables.get(targetParts.slice(0, 2).join('.'));
            if (!target) throw new Error('Target della relazione sconosciuto');
            const remoteName = targetParts[2] ?? target.a.pkey;
            const remote = names(target.composites.get(remoteName)?.a.columns ?? remoteName);
            const local = owner.tag === 'column' ? [name] : names(owner.a.columns);
            if (local.length !== remote.length) throw new Error('Chiavi della relazione incompatibili');
            const key = `${alias}.${name}`;
            if (!this.joins.has(key)) {
                const targetAlias = `${this.aliasPrefix}${this.joins.size + 1}`;
                let condition = local.map((col, i) => `(${this.field(table, alias, col)})=${this.field(target, targetAlias, remote[i])}`).join(' AND ');
                if (relation.a.case_insensitive === 'Y') condition = `lower(${this.field(target, targetAlias, remote[0])}) = lower(${this.field(table, alias, local[0])})`;
                this.joins.set(key, {table: target, alias: targetAlias, condition});
            }
            alias = this.joins.get(key).alias; table = target;
        }
        return returnTarget ? {table, alias} : this.field(table, alias, parts.at(-1));
    }
    expression(text, table = this.table, alias = this.baseAlias, references = null) {
        // Python checks unresolved macros in the authored text, including literals.
        const macro = /#[A-Za-z_]\w*/.exec(text);
        if (macro) throw new UnsupportedFeatureError(`Macro SQL non supportata: ${macro[0]}`);
        split(text);
        references ??= this.resolveReferences([text], table, alias);
        // Python's legacy discover/substitute also resolves references inside SQL literals.
        const replaceFields = text => text.replace(new RegExp(`\\$(${IDENT})|@(${IDENT}(?:\\.@?${IDENT})+)`, 'g'),
            (_, field, path) => references.get(field ?? ('@' + path).replace(/\W/g, '_')));
        return tokens(text).map(token => {
            if (token.kind === 'field') throw new Error('Nomi logici quotati non supportati da Python 0.6.1');
            if (token.kind === 'protected') return replaceFields(token.text);
            if (/;|\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|ATTACH|DETACH|PRAGMA|WITH)\b/i.test(token.text))
                throw new Error('Sottoquery e statement nelle espressioni non ancora supportati');
            if (/#/.test(token.text)) throw new Error('Macro SQL non ancora supportata');
            return replaceFields(token.text).replace(/\bILIKE\b/gi, 'LIKE');
        }).join('');
    }
    resolveReferences(expressions, table = this.table, alias = this.baseAlias) {
        // Python discovers local fields before relation paths in each clause,
        // then resolves the combined ordered dictionary across all clauses.
        const refs = new Map();
        for (const text of expressions.filter(Boolean)) {
            for (const match of text.matchAll(new RegExp(`\\$(${IDENT})`, 'g')))
                refs.set(match[1], {field: match[1]});
            for (const match of text.matchAll(new RegExp(`@(${IDENT}(?:\\.@?${IDENT})+)`, 'g')))
                refs.set(('@' + match[1]).replace(/\W/g, '_'), {path: match[1]});
        }
        return new Map([...refs].map(([key, ref]) => [key, ref.field ? this.field(table, alias, ref.field) : this.related(ref.path, table, alias)]));
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
    projections(columns, bagFields, references) {
        const expanded = split(this.expandColumns(columns, bagFields));
        const entries = new Map();
        for (const raw of expanded) {
            const [value, explicit] = projectionAlias(raw);
            const discovered = value.replace(new RegExp(`@(${IDENT}(?:\\.@?${IDENT})+)`, 'g'), path => '$' + path.replace(/\W/g, '_'));
            const name = explicit ?? fieldReference(discovered) ?? discovered.replace(/\W/g, '_');
            const alias = explicit ? raw.slice(value.length).trim().replace(/^AS\s+/i, '') : q(/^\d/.test(name) ? '_' + name : name);
            entries.set(q(explicit ? alias : name), `${this.expression(value, this.table, this.baseAlias, references)} AS ${alias}`);
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

function selectPlan(context, request) {
    const {table} = context;
    const {limit, offset, distinct = false, bagFields = false, addPkeyColumn = false, for_update = false} = request;
    for (const [name, value] of Object.entries({bagFields, addPkeyColumn, for_update})) if (typeof value !== 'boolean') throw new Error(`${name} deve essere booleano`);
    if (for_update) throw new Error('Le letture con lock richiedono un ciclo transazionale esplicito, non ancora supportato');
    if (distinct != null && typeof distinct !== 'boolean') throw new Error('distinct deve essere booleano');
    for (const [name, value] of Object.entries({limit, offset})) if (value != null && (!Number.isSafeInteger(value) || value < 0)) throw new Error(`${name} deve essere un intero non negativo`);
    const aggregate = Boolean(distinct || request.group_by), count = request.operation === 'count';
    const group = expandTemplates(request.group_by === '*' ? null : request.group_by);
    let columns = request.columns ?? '*';
    if (Array.isArray(columns)) columns = columns.join(',');
    columns = expandTemplates(columns);
    columns = split(columns).map(c => context.expandMany(c, table, true)).join(',');
    let ordering = expandTemplates(request.order_by ?? (!aggregate && !context.parent ? table.a.order_by : null));
    if (count) { ordering = null; columns = group || (distinct ? columns : 'count(*) AS "gnr_row_count"'); }
    else if (addPkeyColumn && table.a.pkey && !aggregate) columns += `,$${table.a.pkey} AS "pkey"`;
    if (table.a.logicalDeletionField && request.exclude_logical_deleted === 'mark' && !aggregate && !count) columns += `,$${table.a.logicalDeletionField} AS "_isdeleted"`;
    // Field-valued WHERE parameters retain their original values in compiled kwargs, as in Python.
    let where = context.period.expand(expandInRange(expandTemplates(request.where)));
    for (const text of [where, ordering, group, request.having]) context.expandMany(text, table);
    if (where) for (const [name, value] of Object.entries(context.bindings.embedValues)) {
        if (/^[A-Za-z_]\w*$/.test(name) && typeof value === 'string' &&
            (value.startsWith('$') && (table.columns.has(value.slice(1)) || table.virtual.has(value.slice(1))) || value.startsWith('@')))
            where = where.replace(new RegExp(`:${name}(\\W|$)`, 'g'), (_, suffix) => value + suffix);
    }
    where = context.policies(request, where);
    columns = context.expandColumns(columns, bagFields);
    let having = expandTemplates(request.having), groupValue;
    [columns, where, ordering, groupValue, having] = [columns, where, ordering, group, having].map(text => text ? context.bindings.substitute(text) : text);
    const references = context.resolveReferences([columns, where, ordering, groupValue, having]);
    const projected = context.projections(columns, bagFields, references);
    const clauses = [['WHERE', where], ['ORDER BY', ordering], ['GROUP BY', groupValue], ['HAVING', having]];
    const resolved = new Map(clauses.map(([name, text]) => [name, text ? context.expression(text, table, context.baseAlias, references) : null]));
    let sql = `SELECT ${distinct ? 'DISTINCT ' : ''}${projected}\n FROM ${tableSQL(table)} AS ${q(context.baseAlias)}`;
    for (const join of context.joins.values()) sql += `\n       LEFT JOIN ${tableSQL(join.table)} AS ${q(join.alias)} ON (${join.condition})`;
    for (const name of ['WHERE', 'GROUP BY', 'HAVING', 'ORDER BY']) if (resolved.get(name)) sql += `\n${name} ${resolved.get(name)}`;
    if (limit) sql += `\nLIMIT ${limit}`;
    else if (offset) sql += '\nLIMIT 9223372036854775807';
    if (offset) sql += `\nOFFSET ${offset}`;
    return {sql, projected, columns};
}

export function compileSelect(tables, table, request, methods = null, parseDateExpression = null) {
    const context = new Context(tables, table, request.sqlparams, request.environment ?? {}, null, 't', null, methods, parseDateExpression);
    const plan = selectPlan(context, request);
    return prepareParameters(context.restore(plan.sql), context.params, request.environment);
}
