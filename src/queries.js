import {sqlInsert, adaptImportRecord} from './import-runtime.js';
import {CompilerMethods, validateCompilerMethods} from './compiler-methods.js';
import {projectApplication} from './application.js';
import {own, record} from './sql-expressions.js';
import {compileSelect} from './select-compiler.js';
import {compileWrite} from './write-compiler.js';
import {writeRecord} from './write-runtime.js';
import {driverParameters} from './sql-parameters.js';
import {RecordNotFoundError, RecordMultipleRowsError, TransactionStateError} from './query-errors.js';

const queues = new WeakMap();
function adapterState(adapter) {
    if (!queues.has(adapter)) queues.set(adapter, {tail: Promise.resolve(), transaction: null});
    return queues.get(adapter);
}
function enqueue(state, action) {
    const result = state.tail.then(action);
    state.tail = result.catch(() => {});
    return result;
}
/** Data-only source for worker-side compilation; no user code crosses the worker. */
export function querySource(builder) {
    return builder.toSource();
}
export function modelFromQuerySource(source, Builder) {
    const model = new Builder();
    const visit = (parent, nodes) => {
        for (const node of nodes) {
            if (!own(model.schema, node.tag)) throw new Error('Unknown model element');
            const child = parent[node.tag](node.attributes);
            visit(child, node.children);
        }
    };
    visit(model.root, source);
    return model;
}


export class SqliteQueries {
    constructor(builder, adapter = null, scope = null, runtime = {}) {
        const application = projectApplication(builder, builder.constructor, {withModel: true});
        this.model = application.model;
        this.model.toMigration();
        this.tables = application.tables;
        this.adapter = adapter;
        this.scope = scope;
        this.runtime = runtime;
        this.compilerEnvironments = new WeakMap();
        this.defaultEnvironment = {};
        if (!scope) {
            record(runtime);
            for (const key of Object.keys(runtime)) if (!['environment', 'hooks', 'clock', 'uuid', 'methods'].includes(key))
                throw new Error(`Unknown runtime option: ${key}`);
            validateCompilerMethods(this.tables, runtime.methods ?? {});
            for (const key of ['clock', 'uuid']) if (runtime[key] != null && typeof runtime[key] !== 'function')
                throw new TypeError(`${key} must be a function`);
            for (const [table, hooks] of Object.entries(record(runtime.hooks ?? {}))) {
                if (!this.tables.has(table)) throw new Error(`Unknown hook table: ${table}`);
                for (const [name, fn] of Object.entries(record(hooks))) {
                    if (!(name.startsWith('trigger_') || ['protect_update', 'protect_delete', 'protect_validate', 'protect_draft', 'newPkeyValue', 'adaptRecord'].includes(name))
                        || typeof fn !== 'function') throw new TypeError(`Invalid hook: ${table}.${name}`);
                }
            }
        }
    }
    get currentTrigger() { return this.scope?.trigger ?? null; }
    get currentUser() { return this.environment().user ?? null; }
    environment() {
        return structuredClone(this.scope?.environment ?? record(typeof this.runtime.environment === 'function'
            ? this.runtime.environment() : this.runtime.environment ?? {}));
    }
    resolveTable(name, write) {
        let table = this.tables.get(name);
        if (!table) {
            const matches = [...this.tables.values()].filter(t => t.a.name === name);
            if (matches.length === 1) table = matches[0];
        }
        if (!table) throw new Error(`Unknown or ambiguous table: ${name}`);
        if (write && [...table.options.values()].some(o => o.spec.enabled !== false)) {
            throw new Error(`${name}: application hooks and options are not implemented for SQL-level writes`);
        }
        for (const c of table.columns.values()) {
            if (['X', 'Z', 'P'].includes(c.a.dtype)) throw new Error('Application codecs are not supported by queries');
            if (write && (c.children.some(n => n.tag !== 'relation') ||
                ['default', 'default_from', 'readOnly', 'unmodifiable',
                    'onInserting','onUpdating','onDeleting','onInserted','onUpdated','onDeleted','trigger_table']
                    .some(k => c.a[k] != null && c.a[k] !== false))) throw new Error(`${name}: write behavior not implemented at the SQL level`);
        }
        if (write && [...table.columns.values()].some(c => c.children.some(n =>
            ['onDelete', 'onUpdate'].some(k => n.a[k] != null) || Object.keys(n.a).some(k => k.startsWith('x_app_'))))) throw new Error('Relation hooks not implemented at the SQL level');
        return table;
    }
    compile(request) {
        record(request);
        const environment = record(request.environment ?? this.scope?.environment ??
            (typeof this.runtime.environment === 'function' ? this.runtime.environment() : this.runtime.environment) ?? this.defaultEnvironment);
        if (!this.compilerEnvironments.has(environment)) this.compilerEnvironments.set(environment, new Map());
        request = {...request, environment: structuredClone(environment)};
        const read = ['select', 'count'].includes(request.operation);
        if (!read && !['insert', 'update', 'delete'].includes(request.operation)) throw new Error('Unsupported query operation');
        const allowed = read ? ['operation', 'table', 'columns', 'where', 'sqlparams', 'order_by', 'limit', 'offset',
            'distinct', 'group_by', 'having', 'bagFields', 'addPkeyColumn', 'for_update', 'exclude_draft', 'exclude_logical_deleted', 'ignore_partition', 'environment']
            : ['operation', 'table', 'values', 'pkey', 'old_record', 'ignore_partition', 'environment'];
        for (const name of Object.keys(request)) if (!allowed.includes(name)) throw new Error(`Unsupported query option: ${name}`);
        const table = this.resolveTable(request.table, !read);
        const methods = new CompilerMethods(this.tables, this.runtime.methods ?? {},
            structuredClone(request.environment), this.compilerEnvironments.get(environment));
        if (!read) return compileWrite(table, request.operation, request.values, {...request, methods});
        return compileSelect(this.tables, table, request, methods);
    }
    async execute(request) {
        const compiled = this.compile(request);
        return this._executeCompiled(compiled, !['select', 'count'].includes(request.operation));
    }
    async _executeCompiled(compiled, write = false) {
        if (!this.adapter) throw new Error('No adapter bound');
        const state = adapterState(this.adapter);
        if (this.scope) {
            return this._inScope(() => this.adapter.query(compiled.sql, driverParameters(compiled)));
        }
        if (state.transaction) throw new TransactionStateError('Use the tx context for operations during a transaction');
        return enqueue(state, async () => {
            if (!write) return this.adapter.query(compiled.sql, driverParameters(compiled));
            await this.adapter.execute('BEGIN IMMEDIATE');
            try {
                const rows = await this.adapter.query(compiled.sql, driverParameters(compiled));
                await this.adapter.execute('COMMIT');
                return rows;
            } catch (error) { await this.adapter.execute('ROLLBACK'); throw error; }
        });
    }
    _inScope(action) {
        const root = this.scope.root ?? this.scope;
        if (!this.scope.active || !root.active) return Promise.reject(new TransactionStateError('The transaction has ended'));
        return enqueue(this.scope, async () => {
            if (root.error) throw root.error;
            try { return await action(); }
            catch (error) { root.error = error; throw error; }
        });
    }
    async _writeRecord(name, operation, values, options = {}) {
        record(options);
        for (const key of Object.keys(options)) if (!['pkey', 'old_record', 'ignore_partition', 'environment'].includes(key))
            throw new Error(`Unsupported write option: ${key}`);
        if (!this.scope) return this.transaction(tx => tx._writeRecord(name, operation, values, options));
        return this._inScope(async () => {
            const child = {active: true, tail: Promise.resolve(), root: this.scope.root ?? this.scope,
                environment: structuredClone(options.environment ?? this.environment()), trigger: this.scope.trigger};
            const db = new SqliteQueries(this.model, this.adapter, child, this.runtime);
            try {
                const result = await writeRecord(db, db.resolveTable(name, false), operation, values, options);
                child.active = false;
                await child.tail;
                if (child.root.error) throw child.root.error;
                return result;
            } finally { child.active = false; await child.tail; }
        });
    }
    async _sqlInsert(name, source, options = {}) {
        if (!this.scope) return this.transaction(tx => tx._sqlInsert(name, source, options));
        return this._inScope(async () => {
            const child = {active: true, tail: Promise.resolve(), root: this.scope.root ?? this.scope,
                environment: this.environment(), trigger: this.scope.trigger};
            const db = new SqliteQueries(this.model, this.adapter, child, this.runtime);
            try {
                const result = await sqlInsert(db, db.resolveTable(name, false), source, options);
                await child.tail;
                if (child.root.error) throw child.root.error;
                return result;
            } finally {child.active = false; await child.tail;}
        });
    }
    async transaction(callback) {
        if (typeof callback !== 'function') throw new TypeError('transaction requires a function');
        if (!this.adapter) throw new Error('No adapter bound');
        const state = adapterState(this.adapter);
        if (this.scope || state.transaction) throw new TransactionStateError('Nested transactions are not supported');
        return enqueue(state, async () => {
            const scope = {active: true, tail: Promise.resolve(), environment: this.environment()};
            const tx = new SqliteQueries(this.model, this.adapter, scope, this.runtime);
            await this.adapter.execute('BEGIN IMMEDIATE');
            state.transaction = scope;
            try {
                const result = await callback(tx);
                scope.active = false;
                await scope.tail;
                if (scope.error) throw scope.error;
                await this.adapter.execute('COMMIT');
                return result;
            } catch (error) {
                scope.active = false;
                await scope.tail;
                await this.adapter.execute('ROLLBACK');
                throw error;
            } finally { scope.active = false; state.transaction = null; }
        });
    }
    table(name) {
        this.resolveTable(name, false);
        const query = (options = {}) => {
            if (typeof options === 'string') options = {columns: options};
            const request = structuredClone({...options, operation: 'select', table: name});
            return {
                compiled: this.compile(request),
                fetch: () => this.execute(request),
                fetchRecord: async (ignoreMissing = false) => {
                    const rows = await this.execute(request.order_by ? {...request, limit: 1} : request);
                    if (!rows.length) { if (ignoreMissing) return null; throw new RecordNotFoundError(); }
                    if (rows.length > 1) throw new RecordMultipleRowsError();
                    return rows[0];
                },
                count: async () => {
                    const rows = await this.execute({...request, operation: 'count'});
                    return rows.length === 1 && own(rows[0], 'gnr_row_count') ? Number(rows[0].gnr_row_count) : rows.length;
                },
                exists: async () => (await this.execute({...request, limit: 1})).length > 0,
            };
        };
        return {
            sql_insert: (source, options) => this._sqlInsert(name, source, options),
            adaptRecord: values => adaptImportRecord(this, this.resolveTable(name, false), values),
            insert: (values, options) => this._writeRecord(name, 'insert', values, options),
            update: (values, options) => this._writeRecord(name, 'update', values, options),
            delete: (values, options) => this._writeRecord(name, 'delete', values, options),
            query,
        };
    }
}
