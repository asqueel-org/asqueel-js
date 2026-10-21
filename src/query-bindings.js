/** Scoped text bindings, ported from Python _sql_bindings.SqlBindings. */
import {record} from './sql-expressions.js';
export class QueryBindings {
    constructor(values = {}, parent = null, prefix = '') {
        values = structuredClone(record(values ?? {}));
        this.available = {...parent?.available, ...values};
        this.params = parent?.params ?? {...values};
        this.state = parent?.state ?? {counter: 0, names: new Set()};
        for (const name of Object.keys(values)) this.state.names.add(name);
        this.names = new Map(parent?.names);
        this.embedValues = {...parent?.embedValues};
        for (const name of Object.keys(values)) delete this.embedValues[name];
        if (prefix !== 'f') Object.assign(this.embedValues, values);
        const namespace = parent ? `${prefix}${++this.state.counter}_` : '';
        this.namespace = namespace;
        for (const name of Object.keys(values)) {
            let bound = namespace + name;
            if (parent) {
                while (this.state.names.has(bound)) bound = '_' + bound;
                this.state.names.add(bound);
            }
            this.names.set(name, bound);
        }
    }
    child(values, prefix) { return new QueryBindings(values, this, prefix); }
    add(name, value) {
        name = this.namespace + name;
        while (this.state.names.has(name)) name = '_' + name;
        this.state.names.add(name);
        this.available[name] = structuredClone(value);
        this.names.set(name, name);
        this.params[name] = this.available[name];
        return name;
    }
    substitute(sql) {
        return sql.replace(/(:)(\w+)(\W|$)/g, (match, colon, name, suffix) => {
            if (!this.names.has(name)) return match;
            const bound = this.names.get(name);
            this.params[bound] = this.available[name];
            return colon + bound + suffix;
        });
    }
}
