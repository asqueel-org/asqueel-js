// Structural option semantics from model_expansion.py / option_validation.py.
import grammar from './generated/grammar.json' with {type: 'json'};
import contract from './generated/contract.json' with {type: 'json'};
import {names} from './structures.js';

const own = (value, key) => Object.hasOwn(value, key);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const error = (path, message) => { throw new Error(`${path}: ${message}`); };
export const defaults = tag => Object.fromEntries(
    grammar.elements[tag].attributes.parameters.filter(p => p.has_default)
        .map(p => [p.name, structuredClone(p.default)]));
export const optionKey = (tag, a) =>
    tag === 'type' ? `type_${a.name}` : contract.namedOptions[tag] ? `${tag}_${a[contract.namedOptions[tag]]}` : tag;

function sourceData(value, path) {
    if (value == null || ['string', 'boolean'].includes(typeof value) || typeof value === 'number' && Number.isFinite(value)) return;
    if (Array.isArray(value)) { value.forEach(v => sourceData(v, path)); return; }
    if (typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
        Object.values(value).forEach(v => sourceData(v, path)); return;
    }
    error(path, 'options require source data, not callbacks or live objects');
}

export function readOptions(node) {
    const result = new Map();
    const container = node.children.find(n => n.tag === 'options');
    for (const option of container?.children || []) {
        const {tag, a} = option, path = `${node.a.name || node.tag}.${tag}`;
        if (tag === 'reset') {
            if (!contract.optionLevels[a.name]?.includes(node.tag)) error(path, 'invalid option reset');
            for (const [key, value] of result) if (value.tag === a.name) result.delete(key);
            continue;
        }
        if (!contract.optionLevels[tag]?.includes(node.tag)) error(path, 'option is not available at this level');
        const spec = {...defaults(tag), ...a};
        sourceData(spec, path);
        if (spec.enabled !== false) {
            for (const key of contract.requiredOptions[tag] || []) {
                if (spec[key] == null || spec[key] === '' || Array.isArray(spec[key]) && !spec[key].length) {
                    error(path, `${key} is required when enabled`);
                }
            }
            if (['system_records', 'release'].includes(tag)) error(path, `${tag} is deferred in Python`);
        }
        for (const key of ['master', 'linked_to', 'preference', 'field', 'parent', 'version_field',
            'relation', 'source', 'caption_field', 'masterfield']) {
            if (spec[key] != null && !nonempty(spec[key])) error(path, `${key} must be a nonempty string`);
        }
        for (const key of ['days', 'depth']) {
            if (spec[key] != null && (!Number.isInteger(spec[key]) || spec[key] < (key === 'depth' ? 1 : 0))) {
                error(path, `${key} is out of range`);
            }
        }
        for (const key of ['columns', 'scope']) {
            if (spec[key] == null) continue;
            const values = typeof spec[key] === 'string' ? spec[key].split(',') : spec[key];
            if (!Array.isArray(values)) error(path, `${key} requires field names`);
            const found = new Set();
            for (let value of values) {
                if (tag === 'hierarchical' && key === 'columns' && value && typeof value === 'object') {
                    if (Object.keys(value).some(k => !['name', 'unique'].includes(k))
                        || own(value, 'unique') && typeof value.unique !== 'boolean') error(path, 'invalid hierarchical column');
                    value = value.name;
                }
                if (!nonempty(value) || found.has(value.trim())) error(path, `invalid or repeated ${key}`);
                found.add(value.trim());
            }
        }
        if (tag === 'sys_fields') {
            for (const field of contract.sysFields) {
                const value = spec[field];
                if (typeof value === 'boolean') continue;
                if (field === 'syscode' || !value || typeof value !== 'object' || Array.isArray(value)) error(path, `invalid ${field}`);
                for (const [key, v] of Object.entries(value)) {
                    if (!(contract.sysFieldKeys.includes(key) || field === 'id' && key === 'type')) error(path, `unknown ${field}.${key}`);
                    if (typeof v !== (key === 'indexed' ? 'boolean' : 'string')) error(path, `invalid ${field}.${key}`);
                }
                if (field === 'id' && own(value, 'type') && value.type !== 'uuid') error(path, 'id.type must be uuid');
            }
        }
        if (tag === 'dynamic_fields' && spec.source != null) error(path, 'table dynamic_fields accepts templates, not source');
        if (spec.rules?.some(rule => !nonempty(rule))) error(path, 'rules must contain nonempty references');
        if (spec.handlers) {
            for (const [version, handler] of Object.entries(spec.handlers)) {
                if (!/^\d+$/.test(version) || !nonempty(handler)) error(path, 'invalid release handler');
            }
        }
        result.set(optionKey(tag, spec), {tag, spec});
    }
    return result;
}

const spec = (t, tag) => {
    const option = t.options.get(tag)?.spec;
    return option && option.enabled !== false ? option : null;
};
const field = (t, name) => t.columns.get(name) || t.virtual.get(name) || t.composites.get(name);
function add(t, name, dtype = 'T', attributes = {}, required = {}) {
    const existing = field(t, name);
    const structure = {dtype, ...required};
    if (existing) {
        if (existing.tag !== 'column') error(t.key, `${name}: conflicts with generated column kind`);
        for (const [key, value] of Object.entries(structure)) {
            if (existing.a[key] != null && existing.a[key] !== value) error(t.key, `${name}: conflicts with option ${key}`);
        }
    }
    const column = {tag: 'column', a: {name, ...attributes, ...(existing?.a || {}), ...structure},
        children: existing?.children || []};
    t.columns.set(name, column);
    return column;
}
function relation(t, column, to, attributes = {}) {
    const existing = column.children.filter(n => n.tag === 'relation');
    if (existing.length > 1) error(t.key, `${column.a.name}: multiple relations`);
    if (existing.length) {
        const a = existing[0].a;
        if (a.to !== to && `${t.namespace}.${a.to}` !== to) error(t.key, 'conflicting generated relation');
        for (const [key, value] of Object.entries(attributes)) {
            if (own(a, key) && a[key] !== value) error(t.key, `conflicting relation ${key}`);
        }
        Object.assign(a, attributes);
    } else column.children.push({tag: 'relation', a: {to, foreign_key: true, ...attributes}, children: []});
}
function target(tables, owner, reference) {
    const key = reference.includes('.') ? reference : `${owner.namespace}.${reference}`;
    const result = tables.get(key);
    if (!result) error(owner.key, `unknown related table ${key}`);
    return result;
}

/** Only physical effects are materialized; runtime hooks/formulas never run. */
export function expandOptions(tables) {
    for (const t of tables.values()) {
        if (spec(t, 'attachments')) {
            for (const tag of ['sys_fields', 'auto_counter']) {
                if (!t.options.has(tag)) t.options.set(tag, {tag, spec: {
                    ...defaults(tag), ...(tag === 'auto_counter' ? {scope: 'maintable_id'} : {}),
                }});
            }
        }
    }
    for (const t of tables.values()) {
        const s = spec(t, 'sys_fields');
        if (s) {
            const definitions = {
                id: ['id', 'A', {size: '22'}],
                ins: ['__ins_ts', 'DHZ', {indexed: true}],
                ldel: ['__del_ts', 'DHZ', {indexed: true}],
                upd: ['__mod_ts', 'DHZ', {indexed: true}],
                user_ins: ['__ins_user', 'T', {}], user_upd: ['__mod_user', 'T', {}],
                draft: ['__is_draft', 'B', {indexed: true}],
                syscode: ['__syscode', 'A', {size: ':20', indexed: true, unique: true}],
            };
            for (const [setting, [name, dtype, attrs]] of Object.entries(definitions)) {
                if (s[setting] === false) continue;
                const custom = typeof s[setting] === 'object' ? s[setting] : {};
                add(t, name, dtype, {...attrs, ...custom}, setting === 'id' ? {size: '22'}
                    : setting === 'syscode' ? {size: ':20', indexed: true, unique: true} : {});
            }
            if (s.id !== false && !own(t.a, 'pkey')) t.a.pkey = 'id';
        }
        let o;
        if ((o = spec(t, 'full_update'))) add(t, o.field, 'DHZ', {indexed: true});
        if ((o = spec(t, 'record_hash'))) add(t, o.field);
        if ((o = spec(t, 'audit'))) add(t, o.version_field, 'L');
        if (spec(t, 'dynamic_fields')) {
            add(t, 'df_fields', 'X'); add(t, 'df_fbcolumns', 'L');
            add(t, 'df_custom_templates', 'X'); add(t, 'df_colswidth');
        }
        if ((o = spec(t, 'auto_counter'))) add(t, o.field, 'L');
        if (spec(t, 'protection')?.tag) add(t, '__protection_tag');
    }
    for (const t of tables.values()) {
        const s = spec(t, 'hierarchical');
        if (!s) continue;
        if (t.a.pkey !== 'id' || t.columns.get('id')?.a.size !== '22') error(t.key, 'hierarchical requires id size 22 as primary key');
        const parent = add(t, s.parent, 'A', {}, {size: '22'});
        relation(t, parent, `${t.key}.id`, {inverse: '_children', deferred: true, on_delete: 'cascade'});
        if (s.root_id) relation(t, add(t, 'root_id', 'A', {}, {size: '22'}), `${t.key}.id`,
            {inverse: '_grandchildren', deferred: true, on_delete: 'ignore'});
        if (s.virtual_roots) add(t, '_virtual_node', 'B');
        const columns = typeof s.columns === 'string' ? names(s.columns) : s.columns || [];
        for (const item of columns) {
            const name = typeof item === 'object' ? item.name : item;
            if (name === 'pkey') continue;
            if (!field(t, name)) error(t.key, `unknown hierarchical field ${name}`);
            add(t, `hierarchical_${name}`, 'T', {}, {unique: typeof item === 'object' ? item.unique ?? false : false});
            add(t, `_parent_h_${name}`);
        }
        add(t, 'hierarchical_pkey', 'T', {}, {unique: true});
        add(t, '_parent_h_pkey');
        const counter = spec(t, 'auto_counter');
        if (counter) {
            if (counter.scope) error(t.key, 'hierarchical auto_counter cannot have a relative scope');
            add(t, '_h_count'); add(t, '_parent_h_count');
        }
    }
    for (const t of tables.values()) {
        const s = spec(t, 'attachments');
        if (!s) continue;
        const master = target(tables, t, s.master);
        if (!master.a.pkey || !master.columns.has(master.a.pkey)) error(t.key, 'attachment master needs a physical primary key');
        add(t, 'id', 'A', {}, {size: '22'});
        for (const name of ['filepath', 'filepath_hash', 'filepath_original_name', 'external_url',
            'description', 'mimetype', 'text_content']) add(t, name);
        add(t, 'info', 'X'); add(t, 'is_foreign_document', 'B');
        relation(t, add(t, 'maintable_id', 'A', {}, {size: '22'}), `${master.key}.${master.a.pkey}`,
            {inverse: 'atc_attachments', on_delete: 'cascade', on_delete_sql: 'cascade', on_duplicate: false, deferred: true});
    }
    for (const t of tables.values()) {
        const s = spec(t, 'hierarchical');
        if (!s?.linked_to) continue;
        const master = target(tables, t, s.linked_to), remote = master.columns.get(master.a.pkey);
        if (!remote) error(t.key, 'linked hierarchy master needs a physical primary key');
        const dtype = {serial: 'L', serial4: 'I'}[remote.a.dtype] || remote.a.dtype || (remote.a.size ? 'A' : 'T');
        relation(t, add(t, `${master.a.name}_${master.a.pkey}`, dtype, {}, remote.a.size ? {size: remote.a.size} : {}),
            `${master.key}.${master.a.pkey}`, {inverse: `${t.a.name}s`, on_duplicate: false, deferred: true, on_delete: 'cascade'});
        relation(master, add(master, `root_${t.a.name}_id`, 'A', {}, {size: '22'}), `${t.key}.id`,
            {one_one: true, on_duplicate: false, on_delete_sql: 'set_null', deferred: true});
    }
    for (const t of tables.values()) {
        const s = spec(t, 'relative_index');
        if (!s) continue;
        const name = s.relation.replace(/^@+/, '');
        const relations = field(t, name)?.children.filter(n => n.tag === 'relation') || [];
        if (relations.length !== 1) error(t.key, 'relative_index needs a column with one direct relation');
        const parts = relations[0].a.to.split('.');
        if (parts.length === 2) parts.unshift(t.namespace);
        const master = target(tables, t, parts.slice(0, 2).join('.'));
        const xtd = target(tables, t, `${master.key}_xtd`);
        add(t, s.field, 'L'); add(xtd, `${t.key.replaceAll('.', '_')}_relidx`, 'L');
    }
}
