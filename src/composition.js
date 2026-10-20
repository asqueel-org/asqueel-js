// Ordered declaration semantics ported from asqueel.builder.SqlBuilder and
// configuration._compose_source. Defaults/expansion belong to later stages.
import {BuilderBase, SourceBag, sourceTarget} from '@genrojs/builders';
import {names} from './structures.js';
import contract from './generated/contract.json' with {type: 'json'};
import {readOptions} from './options.js';

const own = (object, key) => Object.hasOwn(object, key);
const copy = value => structuredClone(value);
const dictionary = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const equal = (a, b) => {
    if (Object.is(a, b)) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => own(b, k) && equal(a[k], b[k]));
};
const children = node => node.value instanceof SourceBag ? node.value.getNodes() : [];
const parentOf = node => node?.parentBag?.parentNode;
const pathOf = node => node.fullpath.replace(/^_root_\./, '');
const put = (object, key, value) => Object.defineProperty(object, key, {value, enumerable: true, writable: true, configurable: true});
const SINGLETONS = new Set(['schemas', 'packages', 'extensions', 'tables', 'columns',
    'virtual_columns', 'composites', 'constraints', 'indexes', 'options']);
const NAMED = new Set(['schema', 'package', 'table', 'column', 'aliasColumn', 'formulaColumn',
    'subQueryColumn', 'pyColumn', 'compositeColumn', 'extension', 'constraint', 'index', 'bagItemColumn']);
const ROUTES = {column: 'columns', formulaColumn: 'virtual_columns', aliasColumn: 'virtual_columns',
    subQueryColumn: 'virtual_columns', pyColumn: 'virtual_columns', compositeColumn: 'composites',
    index: 'indexes', bagItemColumn: 'virtual_columns'};
const VIRTUAL = {aliasColumn: ['relation_path'], formulaColumn: ['sql_formula', 'select', 'exists'],
    subQueryColumn: ['query'], pyColumn: ['py_method', 'method'], bagItemColumn: ['bagcolumn', 'itempath']};
const SEMANTIC_META = ['option_resets', 'disabled_fields', 'inherited_attributes', 'colgroup'];
const POSITIONAL = {...Object.fromEntries([...NAMED, 'db', 'type', 'reset', 'colgroup', 'connection', 'subtable', 'virtualRelation'].map(k => [k, 'name'])),
    relation: 'to', weak_relation: 'to', requires: 'packages', hierarchical: 'columns',
    auto_counter: 'scope', relative_index: 'relation', audit: 'mode', partition: 'name', numbering: 'field', broadcast: 'columns'};
function inPackage(node) {
    for (; node; node = parentOf(node)) if (node.nodeTag === 'package') return true;
    return false;
}
export class CompositionBuilder extends BuilderBase {
    constructor(...args) {
        super(...args);
        this._contribution = 'main';
        this._attributeOrigins = new Map();
    }

    /** Synchronous source construction, matching Python's contribution context. */
    contribution(name, populate) {
        if (typeof name !== 'string' || !name.trim()) throw new Error('contribution name must be nonempty');
        if (typeof populate !== 'function' || populate.constructor.name === 'AsyncFunction') {
            throw new TypeError('contribution requires a synchronous callback');
        }
        const previous = this._contribution;
        this._contribution = name;
        try {
            const result = populate(this.root, this);
            if (result?.then) throw new TypeError('contribution cannot return a Promise');
            return result;
        } finally { this._contribution = previous; }
    }

    node(path) {
        const node = this.source.getNode(path);
        if (!node) throw new Error(`Unknown model node: ${path}`);
        return this.wrapSource(node);
    }

    validateSource() {
        const walk = bag => {
            for (const node of bag.getNodes()) {
                this.validateNodeValues(node.nodeTag, node.value, node.getAttr());
                if (node.nodeTag === 'virtualRelation') this._validateVirtualRelation(node.getAttr());
                if (node.nodeTag === 'table') {
                    const names = new Map();
                    for (const container of children(node)) if (['columns', 'virtual_columns', 'composites'].includes(container.nodeTag)) {
                        for (const field of children(container)) {
                            if (names.has(field.label)) throw new Error(`${pathOf(node)}.${field.label}: conflicting element kinds`);
                            names.set(field.label, field.nodeTag);
                        }
                    }
                }
                if (node.value instanceof SourceBag) walk(node.value);
            }
        };
        walk(this.source);
        return super.validateSource();
    }

    _validationOverrides(node, attributes, parentOverride = null) {
        let other, incoming;
        if (node.nodeTag === 'column') {
            other = children(node).find(n => n.nodeTag === 'validation');
            incoming = Object.fromEntries(Object.entries(attributes).filter(([k]) => k.startsWith('validate_')).map(([k, v]) => [k.slice(9), v]));
        } else if (node.nodeTag === 'validation') {
            other = parentOverride || parentOf(node);
            incoming = Object.fromEntries(Object.entries(attributes).filter(([k]) => k !== '_meta').map(([k, v]) => [`validate_${k}`, v]));
        }
        if (!other) return [];
        const overridden = [];
        for (const [key, value] of Object.entries(incoming)) if (own(other.attr, key)) {
            if (!equal(other.attr[key], value) && (this._attributeOrigins.get(pathOf(other))?.get(key) || 'main') === this._contribution) {
                throw new Error(`${pathOf(node)}: conflicting validation ${key} in contribution ${this._contribution}`);
            }
            overridden.push([other, key]);
        }
        return overridden;
    }

    _composeAttributes(node, attributes, tag = node.nodeTag) {
        const replace = tag !== node.nodeTag;
        if (replace && !(own(VIRTUAL, tag) && own(VIRTUAL, node.nodeTag))) {
            throw new Error(`${pathOf(node)}: conflicting element kinds ${node.nodeTag} and ${tag}`);
        }
        const validation = this._validationOverrides(node, attributes);
        const result = copy(node.getAttr()), origins = new Map(this._attributeOrigins.get(pathOf(node)));
        const meta = result._meta ||= {};
        const inherited = new Set([...(meta.inherited_attributes || []), ...(attributes._meta?.inherited_attributes || [])]);
        if (replace) {
            for (const key of VIRTUAL[node.nodeTag]) if (!VIRTUAL[tag].includes(key) && !own(attributes, key)) {
                delete result[key];
                for (const stored of origins.keys()) if (stored === key || stored.startsWith(key + '.')) origins.delete(stored);
            }
            const declared = new Set(this.schema[node.nodeTag].attributes.parameters.map(p => p.name));
            for (const key of Object.keys(result)) if (declared.has(key) || (this.schema[node.nodeTag]._meta?.attribute_families || []).some(p=>key.startsWith(p)&&/^[A-Za-z_]\w*$/.test(key.slice(p.length)))) inherited.add(key);
            const current = new Set(this.schema[tag].attributes.parameters.map(p => p.name));
            for (const key of inherited) if (!own(result, key) || current.has(key)) inherited.delete(key);
        }
        if (inherited.size) meta.inherited_attributes = [...inherited].sort();
        else delete meta.inherited_attributes;
        const disabled = node.nodeTag === 'sys_fields' ? (meta.disabled_fields ||= {}) : {};
        const origin = parts => {
            for (let i = parts.length; i; i--) if (origins.has(parts.slice(0, i).join('.'))) return origins.get(parts.slice(0, i).join('.'));
            return 'main';
        };
        const assign = (target, key, value, parts, depth = 0) => {
            const previous = own(target, key) ? target[key] : undefined;
            if (depth && dictionary(previous) && dictionary(value)) {
                for (const [k, v] of Object.entries(value)) assign(previous, k, v, [...parts, k], depth - 1);
                return;
            }
            if (!replace && own(target, key) && !equal(previous, value) && origin(parts) === this._contribution) {
                throw new Error(`${pathOf(node)}: conflicting ${parts.join('.')} in contribution ${this._contribution}`);
            }
            put(target, key, copy(value));
            const prefix = parts.join('.');
            for (const stored of origins.keys()) if (stored.startsWith(prefix + '.')) origins.delete(stored);
            origins.set(prefix, this._contribution);
        };
        for (const [key, value] of Object.entries(attributes)) {
            if (key === '_meta') continue;
            if (node.nodeTag === 'sys_fields' && contract.sysFields.includes(key)) {
                const old = result[key];
                if (old === false && (value === true || dictionary(value)) && own(disabled, key)) {
                    assign(result, key, value, [key]);
                    result[key] = {...copy(disabled[key]), ...(dictionary(value) ? copy(value) : {})};
                    delete disabled[key];
                    continue;
                }
                if (value === false && dictionary(old)) put(disabled, key, copy(old));
            }
            const depth = ['records', 'handlers', 'parameters', 'templates'].includes(key)
                || node.nodeTag === 'sys_fields' && contract.sysFields.includes(key) ? 1 : 0;
            assign(result, key, value, [key], depth);
        }
        if (!Object.keys(disabled).length) delete meta.disabled_fields;
        if (!Object.keys(meta).length) delete result._meta;
        node.setAttr(result, false, false, false);
        node.nodeTag = tag;
        this._attributeOrigins.set(pathOf(node), origins);
        for (const [other, key] of validation) delete other.attr[key];
        return node;
    }

    _validateOption(tag, parent, attributes, existing) {
        const owner = parentOf(parent);
        if (tag === 'dynamic_fields' && parent?.nodeTag === 'column') {
            if (attributes.enabled !== false && !attributes.source && !existing?.attr.source) throw new Error('column dynamic_fields requires source');
            if (attributes.templates != null) throw new Error('column dynamic_fields accepts source, not templates');
            return;
        }
        if(tag==='driver') {
            if(owner?.attr.options!=null)throw new Error('Use driver() or legacy connection options, not both');
            const dialect=(owner?.attr.implementation || parentOf(owner)?.attr.implementation || 'sqlite').split(':')[0];
            const allowed=dialect==='sqlite'?['timeout','cached_statements','foreignKeys']:['connect_timeout','application_name','sslmode','sslrootcert','options'];
            for(const k of Object.keys(attributes))if(k!=='_meta'&&!allowed.includes(k))throw new Error(`driver: unsupported ${dialect} option ${k}`);
            for(const k of ['connect_timeout','timeout','cached_statements'])if(own(attributes,k)&&(typeof attributes[k]==='boolean'||attributes[k]!=null&&attributes[k]<0))throw new Error(`driver.${k}: expected a nonnegative number`);
        }
        if (!contract.optionLevels[tag].includes(owner?.nodeTag)) throw new Error(`${tag}: option is not available at this level`);
        readOptions({tag: owner.nodeTag, a: owner.getAttr(), children: [{tag: 'options', children: [
            {tag, a: {...existing?.getAttr(), ...attributes}},
        ]}]}, {allowDeferred: true});
    }

    commandOnNode(node, tag, value, attrs) {
        node = sourceTarget(node);
        if (node.nodeTag === 'colgroup' && own(ROUTES, tag)) {
            attrs = this._prepareCall(tag, value, attrs);
            const table = parentOf(node), prefix = node.attr.name + '.';
            const existing = table.value?.getNode(`${ROUTES[tag]}.${attrs.name}`);
            let group = existing?.attr.group;
            if (group != null && !group.startsWith(prefix)) throw new Error(`${attrs.name}: conflicting column group`);
            const members = parent => children(parent).reduce((count, child) => count
                + (typeof child.attr.group === 'string' && child.attr.group.startsWith(prefix) ? 1 : 0) + members(child), 0);
            group ||= prefix + String(members(table) + 1).padStart(3, '0');
            if (own(attrs, 'group') && attrs.group !== group) throw new Error(`${attrs.name}: conflicting column group`);
            const declared = new Set(this.schema[tag].attributes.parameters.map(p => p.name));
            const defaults = Object.fromEntries(Object.entries(node.attr)
                .filter(([k]) => k.startsWith('col_') && declared.has(k.slice(4)) && !own(existing?.attr || {}, k.slice(4)))
                .map(([k, v]) => [k.slice(4), v]));
            const child = this.commandOnNode(table, tag, null, {...defaults, ...attrs, group});
            child.setAttr({_meta: {...child.getAttr('_meta'), colgroup: node.attr.name}}, false, true, false);
            return child;
        }
        // Route before BuilderBase allocates a detached child branch; otherwise
        // the outer call would overwrite the container created by the route.
        if (node.nodeTag === 'table' && own(ROUTES, tag)) {
            attrs = this._prepareCall(tag, value, attrs);
            const container = this.wrapSource(node)[ROUTES[tag]]();
            return super.commandOnNode(container, tag, null, attrs);
        }
        if (node.nodeTag === 'package' && tag === 'table') {
            attrs = this._prepareCall(tag, value, attrs);
            return super.commandOnNode(this.wrapSource(node).tables(), tag, null, attrs);
        }
        return super.commandOnNode(node, tag, value, attrs);
    }

    _prepareCall(tag, value, attrs = {}) {
        const attributes = copy(attrs);
        if (value === false && contract.tableOptions.includes(tag) && !own(contract.namedOptions, tag)) {
            if (own(attributes, 'enabled')) throw new Error(`${tag}: enabled passed twice`);
            attributes.enabled = false; value = null;
        }
        if (value != null && own(POSITIONAL, tag)) {
            if (own(attributes, POSITIONAL[tag])) throw new Error(`${tag}: ${POSITIONAL[tag]} passed twice`);
            attributes[POSITIONAL[tag]] = value; value = null;
        }
        if (value != null) throw new Error('Model declarations carry attributes and children, not scalar values');
        if(this.constructor.portableModel && tag==='column') for(const k of Object.keys(attributes)) {
            const dialect=/^sql_(pg|sqlite)_(.*)$/.exec(k);
            if(dialect && !['default','extra','generatedExpression'].includes(dialect[2]))throw new Error(`column: unknown attribute ${k}`);
        }
        if (tag === 'column') for (const key of ['unique', 'indexed']) {
            if (typeof attributes[key] === 'string') attributes[key] = !['', 'n', 'no', 'f', 'false', '0'].includes(attributes[key].toLowerCase());
        }
        if (this.constructor.portableModel && tag !== 'validation') {
            const schema=this.schema[tag];
            if(!schema) throw new Error(`Unsupported model element ${tag}`);
            const declared=new Set(schema.attributes.parameters.map(p=>p.name));
            const families=schema._meta?.attribute_families || [];
            for(const k of Object.keys(attributes)) if(!declared.has(k) && !['_meta','node_label','node_position'].includes(k)
                && !families.some(prefix=>k.startsWith(prefix)&&/^[\p{L}_][\p{L}\p{N}_]*$/u.test(k.slice(prefix.length))))
                throw new Error(`${tag}: unknown attribute ${k}`);
        }
        this.validateNodeValues(tag, null, attributes);
        for (const key of ['name', 'namespace']) if (attributes[key] != null && tag !== 'connection') {
            if (typeof attributes[key] !== 'string' || !attributes[key].trim() || /[.@$/\\]/.test(attributes[key])) throw new Error(`${tag}.${key}: invalid name or path separator`);
        }
        if (tag !== 'validation' && (own(attributes, 'metadata') || own(attributes, 'x_ui'))) throw new Error(`${tag}: use flat namespaced attributes`);
        if (tag === 'virtualRelation') this._validateVirtualRelation(attributes);
        if (tag === 'subtable') {
            const declared = new Set(this.schema[tag].attributes.parameters.map(p => p.name));
            for (const key of Object.keys(attributes)) if (!declared.has(key) && !key.includes('_')) throw new Error(`subtable: unknown attribute ${key}`);
        }
        if (tag === 'colgroup') {
            const declared = new Set(this.schema.column.attributes.parameters.map(p => p.name));
            for (const key of Object.keys(attributes)) {
                if (['name', 'name_long', 'name_short', 'comment', '_meta'].includes(key)) continue;
                if (!key.startsWith('col_') || key === 'col_name' || !declared.has(key.slice(4))) throw new Error(`colgroup: unknown column default ${key}`);
            }
            this.validateNodeValues('column', null, {name: '__group_default__', ...Object.fromEntries(
                Object.entries(attributes).filter(([k]) => k.startsWith('col_')).map(([k, v]) => [k.slice(4), v]))});
        }
        return attributes;
    }

    _validateVirtualRelation(attributes) {
        const declared = new Set(this.schema.virtualRelation.attributes.parameters.map(p => p.name));
        for (const key of Object.keys(attributes)) {
            if (declared.has(key) || ['_meta', '_tag', 'node_label', 'node_position'].includes(key)
                || !this.constructor.portableModel && key.startsWith('x_') || /^var_[A-Za-z_][A-Za-z0-9_]*$/.test(key) && key.trim() === key) continue;
            throw new Error(`virtualRelation: unsupported attribute ${key}`);
        }
    }

    setChild(bag, tag, value, attrs = {}, parentOverride = null) {
        const attributes = this._prepareCall(tag, value, attrs);
        value = null;
        const parent = parentOverride || bag.parentNode;
        if (tag === 'weak_relation') return this.setChild(bag, 'relation', value, {...attributes, foreign_key: false, x_weak: true}, parentOverride);
        if (tag === 'relation' && Object.hasOwn(VIRTUAL, parent?.nodeTag)) {
            attributes.foreign_key ??= false;
            if (attributes.foreign_key) throw new Error('foreign_key is not allowed on virtual columns');
            attributes.x_weak = true;
        }
        if (tag === 'relation' && inPackage(parent)) {
            if (attributes.cnd && attributes.foreign_key) throw new Error('relation with cnd has no foreign key');
            if (!own(attributes, 'foreign_key')) attributes.foreign_key = !attributes.cnd;
            attributes.x_canonical = true;
        }
        if (tag === 'reset') {
            this.validateParent(tag, parent?.nodeTag);
            const name = attributes.name;
            if (!contract.optionLevels[name]?.includes(parentOf(parent)?.nodeTag)) throw new Error(`Cannot reset unknown option ${name} at this level`);
            for (const node of bag.getNodes()) if (node.nodeTag === name) {
                this._attributeOrigins.delete(pathOf(node));
                bag.popNode(node.label);
            }
            const meta = copy(parent.attr._meta || {});
            meta.option_resets = [...new Set([...(meta.option_resets || []), name])].sort();
            parent.setAttr({_meta: meta}, false, true, false);
            return parent;
        }
        let label;
        if (['colgroup', 'subtable', 'virtualRelation'].includes(tag)) label = `${tag}_${attributes.name}`;
        if (SINGLETONS.has(tag)) label = tag;
        if (NAMED.has(tag)) {
            if (attributes.node_label != null) throw new Error(`${tag}: node_label is fixed by its SQL name`);
            if (tag === 'index') {
                if (Array.isArray(attributes.columns)) attributes.columns = attributes.columns.join(',');
                if (attributes.name == null) {
                    const table = parent?.nodeTag === 'table' ? parent : parentOf(parent);
                    attributes.name = `${table?.label}_${names(attributes.columns).join('_')}_key`;
                }
            }
            label = attributes.name;
        }
        if (tag === 'connection') {
            const named=own(attributes,'database')||own(attributes,'dsn'),name=attributes.name||'main';
            if(attributes.dsn!=null&&['database','host','port','user','password'].some(k=>own(attributes,k)))throw new Error('dsn and individual connection fields cannot be combined');
            label=named&&name!=='main'?`connection_${name}`:'connection';
            attributes.node_label=label;
        }
        if (['validation', 'encryption'].includes(tag)) label = tag;
        if (own(contract.optionLevels, tag)) {
            if (attributes.node_label != null) throw new Error(`${tag}: node_label is fixed by the option identity`);
            const identity = attributes[contract.namedOptions[tag] || 'name'];
            if (identity != null && (typeof identity !== 'string' || !identity || identity.includes('.'))) throw new Error(`${tag}: invalid option identifier`);
            label = identity != null ? `${tag}_${identity}` : tag;
            this._validateOption(tag, parent, attributes, bag.node(label));
        }
        const existing = label ? bag.node(label) : null;
        if (existing) {
            this.validateParent(tag, parent?.nodeTag);
            if (tag === 'colgroup') {
                if (!equal(existing.getAttr(), {...existing.getAttr(), ...attributes})) throw new Error(`colgroup ${attributes.name}: conflicting definition`);
                return existing;
            }
            if (SINGLETONS.has(tag)) {
                if (existing.nodeTag !== tag) throw new Error(`conflicting element kind for ${tag}`);
                return existing;
            }
            if (['schema', 'package', 'validation', 'encryption', 'connection', 'subtable', 'virtualRelation'].includes(tag) || own(contract.optionLevels, tag) || inPackage(parent)) {
                return this._composeAttributes(existing, attributes, tag);
            }
        }
        if (own(contract.optionLevels, tag) && !this.schema[tag].node_label) attributes.node_label = label;
        if (['colgroup', 'subtable', 'virtualRelation'].includes(tag)) attributes.node_label = label;
        // Check cross-spelling validation conflicts before publishing a new child.
        if (tag === 'validation') this._validationOverrides({nodeTag: tag, parentBag: bag, fullpath: `${parent?.fullpath}.validation`}, attributes, parent);
        const child = super.setChild(bag, tag, value, attributes, parentOverride);
        const stored = {...child.getAttr(), ...Object.fromEntries(Object.entries(attributes).filter(([k]) => !['node_label', 'node_position'].includes(k)))};
        child.setAttr(copy(stored), false, false, false);
        const childPath = parentOverride ? `${pathOf(parentOverride)}.${child.label}` : pathOf(child);
        this._attributeOrigins.set(childPath, new Map(Object.keys(stored).filter(k => k !== '_meta').map(k => [k, this._contribution])));
        for (const [other, key] of this._validationOverrides(child, attributes, parent)) delete other.attr[key];
        return child;
    }

    /** Source snapshot preserves semantic metadata, but no builder internals. */
    toSource() {
        const walk = bag => bag.getNodes().map(node => {
            if (node.value != null && !(node.value instanceof SourceBag)) throw new Error(`${pathOf(node)}: model nodes cannot carry scalar values`);
            const attributes = copy(node.getAttr());
            const meta = Object.fromEntries(SEMANTIC_META.filter(k => own(attributes._meta || {}, k)).map(k => [k, attributes._meta[k]]));
            delete attributes._meta;
            if (Object.keys(meta).length) attributes._meta = meta;
            return {tag: node.nodeTag, label: node.label, attributes, children: node.value instanceof SourceBag ? walk(node.value) : []};
        });
        return walk(this.source);
    }

    clone() {
        const result = new this.constructor();
        result._mergeSource(this.toSource());
        result.data.update(this.data.deepcopy());
        result._attributeOrigins = new Map([...this._attributeOrigins].map(([p, v]) => [p, new Map(v)]));
        result._contribution = this._contribution;
        return result;
    }

    _mergeSource(source, target = this.source) {
        for (const {tag, label, attributes, children: descendants} of source) {
            let existing = target.node(label);
            if (!existing) {
                existing = target.setItem(label, null, copy(attributes), '>', false, false, null, false, false, null, tag);
                this._attributeOrigins.set(pathOf(existing), new Map(Object.keys(attributes).filter(k => k !== '_meta').map(k => [k, this._contribution])));
                for (const [other, key] of this._validationOverrides(existing, attributes)) delete other.attr[key];
            } else {
                const incoming = copy(attributes);
                const group = incoming._meta?.colgroup;
                if (existing.nodeTag !== tag && group && existing.attr.group?.startsWith(group + '.')) delete incoming.group;
                this._composeAttributes(existing, incoming, tag);
                if (tag === 'options') {
                    const resets = attributes._meta?.option_resets || [];
                    for (const child of children(existing)) if (resets.includes(child.nodeTag)) existing.value.popNode(child.label);
                    if (resets.length) existing.setAttr({_meta: {...existing.attr._meta,
                        option_resets: [...new Set([...(existing.attr._meta?.option_resets || []), ...resets])].sort()}}, false, true, false);
                }
            }
            if (descendants.length) {
                if (!(existing.value instanceof SourceBag)) existing.setValue(new SourceBag(null, this));
                this._mergeSource(descendants, existing.value);
            }
        }
    }

    static compose(...layers) {
        if (!layers.length || layers.some(m => !(m instanceof this))) throw new TypeError('compose requires model builders');
        const result = layers[0].clone();
        layers.slice(1).forEach((layer, i) => result.contribution(`layer[${i + 1}]`, () => result._mergeSource(layer.toSource())));
        result.validateSource();
        return result;
    }
}
