// Mechanical port of asqueel_migration.structures' structure-1.0 factories.
import {md5} from '@noble/hashes/legacy.js';
import {bytesToHex} from '@noble/hashes/utils.js';

export const names = value => value == null ? []
    : Array.isArray(value) ? value.map(v => String(v).trim())
    : typeof value === 'object' ? Object.keys(value)
    : String(value).split(',').map(v => v.trim()).filter(Boolean);

// Python clean_attributes also removes numeric zero (0 == False).
export function clean(attributes) {
    return Object.fromEntries(Object.entries(attributes).filter(([, value]) =>
        value != null && value !== false && value !== 0 && value !== '' && value !== 'NO ACTION'
        && !(typeof value === 'object' && Object.keys(value).length === 0)));
}

export function hashName(schema, table, columns, kind = 'idx') {
    const input = new TextEncoder().encode(`${schema}_${table}_${columns.join('_')}_${kind}`);
    return `${kind}_${bytesToHex(md5(input)).slice(0, 8)}`;
}

export function entity(kind, schema, table, name, attributes) {
    return {entity: kind, entity_name: name, attributes,
        schema_name: schema, table_name: table};
}

export function indexItem(schema, table, columns, attributes, indexName) {
    const name = hashName(schema, table, columns, 'idx');
    return entity('index', schema, table, name,
        clean({...attributes, index_name: indexName || name}));
}

export function constraintItem(schema, table, columns, kind, name, checkClause) {
    if (kind === 'CHECK') {
        return entity('constraint', schema, table, name, {
            constraint_name: name, constraint_type: kind, check_clause: checkClause,
        });
    }
    const hash = hashName(schema, table, columns, 'cst');
    return entity('constraint', schema, table, hash, {
        columns, constraint_name: name || hash, constraint_type: kind,
    });
}

export function relationItem(schema, table, columns, attributes, constraintName) {
    const name = hashName(schema, table, columns, 'fk');
    return entity('relation', schema, table, name,
        clean({...attributes, columns, constraint_name: constraintName || name}));
}

// Define own data properties even for names such as "__proto__".
export function put(object, name, value) {
    Object.defineProperty(object, name, {value, enumerable: true, configurable: true, writable: true});
    return value;
}
