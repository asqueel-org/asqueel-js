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

export function readOptions(node, {allowDeferred = false} = {}) {
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
            if (!allowDeferred && ['system_records', 'release'].includes(tag)) error(path, `${tag} is deferred in Python`);
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
