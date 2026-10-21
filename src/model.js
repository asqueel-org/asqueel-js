// Hierarchical model, mechanically following Asqueel 0.6.1 object_tree*.py.
import grammar from "./generated/grammar.json" with { type: "json" };
import contract from "./generated/contract.json" with { type: "json" };
import { defaults, readOptions } from "./options.js";
import { names } from "./structures.js";
import {
  child,
  container,
  makeNode,
  expandModelOptions,
} from "./model-options.js";
import { PhysicalBuilder } from "./internal/physical-renderer.js";
const copy = structuredClone,
  own = (o, k) => Object.hasOwn(o, k);
const fail = (m) => {
  throw new Error(m);
};
const present = (o) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
const list = (n, k) => child(n, k)?.children || [];
const family = (t) =>
  ["columns", "virtual_columns", "composites"].flatMap((k) => list(t, k));
const relations = (t) =>
  family(t).flatMap((c) =>
    c.children.filter((n) => n.tag === "relation").map((n) => [c, n]),
  );
const idxName = (t, cs) => `${t}_${names(cs).join("_")}_key`;
const sqlActions = {
  c: "CASCADE",
  cascade: "CASCADE",
  r: "RESTRICT",
  restrict: "RESTRICT",
  n: null,
  "no action": null,
  sn: "SET NULL",
  setnull: "SET NULL",
  "set null": "SET NULL",
  sd: "SET DEFAULT",
  setdefault: "SET DEFAULT",
  "set default": "SET DEFAULT",
};
const attrsAllowed = (tag, k) =>
  grammar.elements[tag]?._meta?.attribute_families?.some(
    (p) =>
      k.startsWith(p) && /^[\p{L}_][\p{L}\p{N}_]*$/u.test(k.slice(p.length)),
  );
function snapshot(n, schemas) {
  const a = copy(n.attributes),
    meta = a._meta || {};
  delete a._meta;
  const spec = schemas[n.tag];
  if (!spec) fail(`Unsupported model element ${n.tag}`);
  const declared = new Set(spec.attributes.parameters.map((p) => p.name));
  if (n.tag !== "validation")
    for (const k of Object.keys(a))
      if (
        !declared.has(k) &&
        !attrsAllowed(n.tag, k) &&
        !meta.inherited_attributes?.includes(k)
      )
        fail(`${n.label}: unknown attribute ${k}`);
  const d = [];
  if (n.tag !== "validation")
    for (const [k, v] of spec.attributes.parameters
      .filter((p) => p.has_default)
      .map((p) => [p.name, copy(p.default)]))
      if (
        v != null &&
        !own(a, k) &&
        !(n.tag === "relation" && k === "indexed" && !a.foreign_key)
      ) {
        a[k] = copy(v);
        d.push(k);
      }
  return {
    ...makeNode(
      n.tag,
      n.label,
      a,
      n.children.map((c) => snapshot(c, schemas)),
    ),
    defaults: d,
  };
}
function prepare(builder) {
  const errors = builder.validateSource();
  if (errors.length) fail(JSON.stringify(errors));
  const roots = builder.toSource();
  const bind = (snapshots, nodes) =>
    snapshots.forEach((snapshot, index) => {
      const node = nodes[index],
        meta = snapshot.attributes._meta;
      snapshot.attributes = copy(builder.runtimeValues(node)[1]);
      if (meta) snapshot.attributes._meta = meta;
      if (snapshot.children.length)
        bind(snapshot.children, node.value.getNodes());
    });
  bind(roots, builder.source.getNodes());

  if (roots.length !== 1 || roots[0].tag !== "db")
    fail("Exactly one db root is required");
  const root = snapshot(roots[0], builder.schema);
  const connection = root.children.find(
    (n) =>
      n.tag === "connection" && ["main", undefined].includes(n.attributes.name),
  );
  if (connection?.attributes.implementation)
    root.attributes.implementation = connection.attributes.implementation;
  root.children = root.children.filter((n) => n.tag !== "connection");
  if (own(root.attributes, "conninfo")) root.attributes.conninfo = "";
  delete root.attributes.connect_kwargs;
  const optionView = (n) => ({
    tag: n.tag,
    a: n.attributes,
    children: n.children.map(optionView),
  });
  function check(n) {
    if (
      n.tag === "virtualRelation" &&
      n.attributes.table &&
      !n.attributes.condition?.trim()
    )
      fail("virtualRelation: table requires a nonempty condition");
    if (child(n, "options")) readOptions(optionView(n));
    n.children.forEach(check);
  }
  check(root);
  if (child(root, "schemas") && child(root, "packages"))
    fail("packages and schemas cannot be combined");
  const ns =
    child(root, "packages") || child(root, "schemas") || makeNode("packages");
  const tables = new Map();
  for (const pkg of ns.children) {
    if (pkg.attributes.path)
      fail(
        "package.path requires the Python filesystem loader; supply explicit JS contributions",
      );
    for (const t of list(pkg, "tables")) {
      t.packaged = pkg.tag === "package";
      t.package = pkg;
      tables.set(`${pkg.name}.${t.name}`, t);
    }
  }
  const types = () => {
    for (const [key, t] of tables) {
      const aliases = list(t.package, "options");
      for (const c of family(t)) {
        const dtype = c.attributes.dtype;
        if (dtype == null || contract.dtypeCodes.includes(dtype)) continue;
        const alias = aliases.find(
          (n) => n.tag === "type" && n.attributes.name === dtype,
        );
        if (!alias) fail(`${key}.${c.name}: unknown dtype ${dtype}`);
        c.attributes = {
          ...Object.fromEntries(
            Object.entries(alias.attributes).filter(([k]) => k !== "name"),
          ),
          ...c.attributes,
          dtype: alias.attributes.dtype,
        };
      }
    }
  };
  types();
  expandModelOptions(tables);
  types();
  const target = (t, a) => {
    let parts = a.to?.split(".");
    if (!parts || ![2, 3].includes(parts.length))
      fail(`Invalid relation target ${a.to}`);
    if (
      parts.length === 2 &&
      !ns.children.some((n) => n.name === parts[0]) &&
      tables.has(`${t.package.name}.${parts[0]}`)
    )
      parts.unshift(t.package.name);
    a.to = parts.join(".");
    const remote = tables.get(parts.slice(0, 2).join("."));
    if (!remote) fail(`unknown relation target ${a.to}`);
    const key = parts[2] || remote.attributes.pkey;
    const composite = list(remote, "composites").find((n) => n.name === key);
    const cs = composite ? names(composite.attributes.columns) : names(key);
    if (
      !cs.length ||
      cs.some((n) => !list(remote, "columns").some((c) => c.name === n))
    )
      fail(`invalid physical target ${a.to}`);
    return { remote, cs };
  };
  for (const [key, t] of tables) {
    const pk = t.attributes.pkey,
      composite = list(t, "composites").find((c) => c.name === pk);
    if (t.packaged && pk?.includes(",") && !composite)
      fail(`${key}: pkey must name a column or compositeColumn`);
    if (composite) {
      t.attributes.x_logical_pkey = pk;
      t.attributes.pkey = composite.attributes.columns;
    }
    for (const [c, n] of relations(t)) {
      const a = n.attributes;
      if (a.name) a.x_name = a.name;
      target(t, a);
      if (
        a.x_canonical &&
        a.one_group == null &&
        c.attributes.group &&
        c.attributes.group !== "_"
      ) {
        a.one_group = c.attributes.group;
        c.attributes.one_group = c.attributes.group;
        c.attributes.group = "_";
      }
      if (
        (!own(a, "deferred") || n.defaults.includes("deferred")) &&
        (a.onDelete?.toLowerCase().startsWith("setnull") ||
          sqlActions[a.onDelete_sql?.toLowerCase()] === "SET NULL")
      )
        a.deferred = true;
    }
  }
  for (
    let pass = 0;
    pass <= [...tables.values()].reduce((a, t) => a + relations(t).length, 0);
    pass++
  ) {
    let changed = false;
    for (const t of tables.values())
      for (const [c, n] of relations(t)) {
        const { remote, cs } = target(t, n.attributes);
        if (c.tag !== "column" || cs.length !== 1) continue;
        const r = list(remote, "columns").find(
          (c) => c.name === cs[0],
        ).attributes;
        const dtype =
          { serial: "L", serial4: "I" }[r.dtype] ||
          r.dtype ||
          (r.size ? "A" : null);
        if (c.attributes.dtype == null && dtype != null) {
          c.attributes.dtype = dtype;
          if (c.attributes.size == null && r.size != null)
            c.attributes.size = r.size;
          changed = true;
        }
      }
    if (!changed) break;
  }
  for (const t of tables.values())
    for (const [c, n] of relations(t)) {
      const a = n.attributes;
      if (
        !a.x_weak ||
        a.indexed === false ||
        !["column", "compositeColumn"].includes(c.tag)
      )
        continue;
      const { remote, cs } = target(t, a),
        key = a.to.split(".")[2];
      const other = family(remote).find((n) => n.name === (key || cs[0]));
      for (const [owner, col] of [
        [t, c],
        [remote, other],
      ])
        if (col) {
          if (col.tag === "column") {
            if (
              !own(col.attributes, "indexed") ||
              col.defaults.includes("indexed")
            )
              col.attributes.indexed = true;
          } else if (col.tag === "compositeColumn" && !col.attributes.unique) {
            const members = names(col.attributes.columns),
              existing = list(owner, "indexes").filter(
                (n) =>
                  JSON.stringify(names(n.attributes.columns)) ===
                  JSON.stringify(members),
              );
            if (
              existing.some(
                (n) =>
                  n.attributes.where ||
                  (n.attributes.method && n.attributes.method !== "btree"),
              )
            )
              fail("partial/non-btree index cannot cover weak relation");
            if (!existing.length)
              container(owner, "indexes").children.push(
                makeNode("index", idxName(owner.name, members), {
                  columns: col.attributes.columns,
                  name: idxName(owner.name, members),
                }),
              );
          }
        }
    }
  for (const [key, t] of tables) {
    const columns = list(t, "columns"),
      physical = new Set(columns.map((c) => c.name)),
      all = family(t);
    if (new Set(all.map((n) => n.name)).size !== all.length)
      fail(`${key}: duplicate column-family name`);
    const check = (raw, required = true) => {
      const ns = names(raw);
      if (required && !ns.length) fail(`${key}: columns must not be empty`);
      if (new Set(ns).size !== ns.length) fail(`${key}: repeated columns`);
      for (const n of ns)
        if (!physical.has(n)) fail(`${key}: unknown physical column ${n}`);
      return JSON.stringify(ns);
    };
    check(t.attributes.pkey, false);
    const unique = new Set(),
      indexes = new Set();
    for (const c of list(t, "composites")) {
      const k = check(c.attributes.columns);
      if (c.attributes.unique) {
        if (unique.has(k)) fail("duplicate UNIQUE");
        unique.add(k);
      }
    }
    for (const c of list(t, "constraints")) {
      const a = c.attributes,
        k = check(a.columns, a.constraint_type === "UNIQUE");
      if (a.constraint_type === "CHECK" && !a.check_clause)
        fail("CHECK requires check_clause");
      if (a.constraint_type === "UNIQUE") {
        if (unique.has(k)) fail("duplicate UNIQUE");
        unique.add(k);
      }
    }
    for (const n of list(t, "indexes")) {
      const k = check(n.attributes.columns);
      if (indexes.has(k)) fail("duplicate index");
      indexes.add(k);
      if (
        typeof n.attributes.columns === "object" &&
        Object.values(n.attributes.columns).some(
          (v) => v !== null && v !== "DESC",
        )
      )
        fail("index order must be null or DESC");
    }
    const relationKeys = new Set();
    for (const [c, n] of relations(t)) {
      const a = n.attributes,
        { cs } = target(t, a),
        local =
          c.tag === "compositeColumn" ? names(c.attributes.columns) : [c.name];
      const key = JSON.stringify(local);
      if (relationKeys.has(key)) fail("at most one relation per local columns");
      relationKeys.add(key);
      if (cs.length !== local.length) fail("relation column counts differ");
      for (const k of ["onDelete", "onUpdate"]) {
        if (
          a[k] != null &&
          !["raise", "cascade", "setnull", "ignore"].includes(
            a[k].split(":")[0].toLowerCase(),
          )
        )
          fail(`invalid ${k}`);
        if (
          a[k + "_sql"] != null &&
          !own(sqlActions, a[k + "_sql"].toLowerCase())
        )
          fail(`invalid ${k}_sql`);
      }
      if (
        !a.foreign_key &&
        !a.x_weak &&
        [
          "onDelete_sql",
          "onUpdate_sql",
          "deferred",
          "deferrable",
          "initially_deferred",
        ].some((k) => a[k])
      )
        fail("physical relation options require foreign_key");
      if (a.initially_deferred && !a.deferrable && !a.deferred)
        fail("initially_deferred requires deferrable");
    }
  }
  function ordered(n) {
    const opts = child(n, "options");
    if (opts) n.children = [opts, ...n.children.filter((c) => c !== opts)];
    n.children.forEach(ordered);
  }
  ordered(root);
  return root;
}
export class ModelNode {
  constructor(fragment, model, parent = null) {
    this.name = fragment.name;
    this.tag = fragment.tag;
    this.attributes = copy(fragment.attributes);
    this.parent = parent;
    this.model = model;
    this.signatureDefaults =
      fragment.defaults || fragment.signatureDefaults || [];
    this.generated = fragment.generated || false;
    this.children = new Map();
    if (["package", "schema"].includes(this.tag))
      Object.defineProperty(this, "table", {
        value: (name) => {
          const t = this.tables?.get(name);
          if (!t) fail(`Unknown table ${this.name}.${name}`);
          return t;
        },
      });
    for (const f of fragment.children) {
      const c = new ModelNode(f, model, this),
        key = c.name.toLowerCase();
      if (this.children.has(key)) fail(`Duplicate child ${c.name}`);
      this.children.set(key, c);
    }
    if (this.tag === "table") {
      if (own(this.attributes, "x_table_class"))
        fail(
          "x_table_class requires a Python SqlTable subclass and is not portable JSON",
        );
      for (const key of ["columns", "virtual_columns", "indexes"])
        if (!this.get(key))
          this.children.set(
            key,
            new ModelNode({ ...makeNode(key), generated: true }, model, this),
          );
      for (const c of this.columns.values()) {
        const indexed = c.attributes.indexed;
        if (c.attributes.unique) this.addIndex(c.name, { unique: true });
        else if (
          indexed &&
          (typeof indexed !== "object" || Object.keys(indexed).length)
        ) {
          const spec = typeof indexed === "object" ? copy(indexed) : {};
          for (const k of Object.keys(spec))
            if (
              !["unique", "method", "where", "tablespace", "sorting"].includes(
                k,
              ) &&
              !k.startsWith("with_")
            )
              fail(`unknown indexed option ${k}`);
          if (spec.unique && !spec.where) continue;
          const opts = Object.fromEntries(
            Object.entries(spec)
              .filter(([k]) => k.startsWith("with_"))
              .map(([k, v]) => [k.slice(5), v]),
          );
          const a = {
            columns: { [c.name]: spec.sorting || null },
            ...Object.fromEntries(
              Object.entries(spec).filter(
                ([k, v]) => k !== "sorting" && !k.startsWith("with_") && v,
              ),
            ),
          };
          if (Object.keys(opts).length) a.with_options = opts;
          this.addIndex(c.name, a);
        }
      }
    }
    if (
      [
        "formulaColumn",
        "aliasColumn",
        "subQueryColumn",
        "bagItemColumn",
        "pyColumn",
        "compositeColumn",
      ].includes(this.tag) &&
      this.values().some((c) => ["relation", "weak_relation"].includes(c.tag))
    )
      this.attributes.virtual = true;
  }
  get(name, fallback = null) {
    return this.children.get(name.toLowerCase()) ?? fallback;
  }
  at(path) {
    let n = path.startsWith(".") ? this.root : this;
    for (const k of path.replace(/^\./, "").split(".")) n = n?.get(k);
    return n ?? null;
  }
  keys() {
    return [...this.children.keys()];
  }
  values() {
    return [...this.children.values()];
  }
  items() {
    return [...this.children];
  }
  getAttr(name = null, fallback = null) {
    return name == null ? this.attributes : (this.attributes[name] ?? fallback);
  }
  get root() {
    return this.parent?.root || this;
  }
  get db() {
    return this.model.db;
  }
  get dbroot() {
    return this.db;
  }
  get pkg() {
    return ["package", "schema"].includes(this.tag)
      ? this
      : this.parent?.pkg || null;
  }
  get ownerTable() {
    return this.tag === "table" ? this : this.parent?.ownerTable || null;
  }
  get fullname() {
    return this.tag === "table"
      ? `${this.pkg.name}.${this.name}`
      : `${this.ownerTable?.fullname}.${this.name}`;
  }
  get columns() {
    return this.get("columns");
  }
  get virtual_columns() {
    return this.get("virtual_columns");
  }
  get composites() {
    return this.get("composites");
  }
  get indexes() {
    return this.get("indexes");
  }
  get tables() {
    return this.get("tables");
  }
  get options() {
    return this.get("options");
  }
  get name_short() {
    return this.attributes.name_short || this.attributes.name_long || this.name;
  }
  get name_long() {
    return this.attributes.name_long || this.name_short;
  }
  get name_full() {
    return this.attributes.name_full || this.name_long;
  }
  get name_plural() {
    return this.attributes.name_plural || this.name_long;
  }
  get sqlschema() {
    if (this.tag === "table")
      return this.attributes.sqlschema || this.pkg.sqlschema;
    return (
      this.attributes.sqlschema ||
      (this.tag === "schema"
        ? this.attributes.sqlname || this.name
        : this.model.implementation.split(":")[0] === "sqlite"
          ? "main"
          : "public")
    );
  }
  get sqlname() {
    if (this.attributes.sqlname) return this.attributes.sqlname;
    if (this.tag === "table") {
      let p = this.pkg.attributes.sqlprefix ?? this.pkg.tag === "package";
      p = p === true ? this.pkg.name : p || "";
      return p ? `${p}_${this.name}` : this.name;
    }
    if (this.tag === "index")
      return `${this.ownerTable.sqlname}_${names(this.attributes.columns).join("_")}_idx`;
    return this.name;
  }
  get pkey() {
    return this.attributes.x_logical_pkey || this.attributes.pkey || null;
  }
  get pkeys() {
    const c = this.composites?.get(this.pkey || "");
    return c ? names(c.attributes.columns) : this.pkey ? [this.pkey] : [];
  }
  get lastTS() {
    return this.attributes.lastTS || "";
  }
  get logicalDeletionField() {
    return this.attributes.logicalDeletionField || "";
  }
  get draftField() {
    return this.attributes.draftField || "";
  }
  get dtype() {
    return (
      this.attributes.dtype ||
      (this.tag === "compositeColumn"
        ? "JS"
        : this.tag === "formulaColumn"
          ? "A"
          : this.attributes.size
            ? "A"
            : "T")
    );
  }
  get print_width() {
    return this.attributes.print_width ?? null;
  }
  get validations() {
    return copy({
      ...Object.fromEntries(
        Object.entries(this.attributes)
          .filter(([k]) => k.startsWith("validate_"))
          .map(([k, v]) => [k.slice(9), v]),
      ),
      ...this.get("validation")?.attributes,
    });
  }
  addIndex(columns, a = {}) {
    const n = idxName(this.name, columns);
    if (!this.indexes.get(n))
      this.indexes.children.set(
        n.toLowerCase(),
        new ModelNode(
          { ...makeNode("index", n, { columns, ...a }), generated: true },
          this.model,
          this.indexes,
        ),
      );
  }
  get table() {
    return this.ownerTable;
  }
  get dynamic_columns() {
    return new Map();
  }
  get relations() {
    return new RelationTree(this.model, this);
  }

  column(path, seen = new Set()) {
    path = path.replace(/^\$/, "");
    if (path.startsWith("@")) {
      const i = path.indexOf("."),
        rel = this.model.relations.get(`${this.fullname}.${path.slice(0, i)}`);
      if (i < 0 || !rel) fail(`Unknown column path ${this.fullname}.${path}`);
      return this.model
        .table(rel.mode === "O" ? rel.one_relation : rel.many_relation)
        .column(path.slice(i + 1), seen);
    }
    const c =
      this.columns?.get(path) ||
      this.virtual_columns?.get(path) ||
      this.composites?.get(path);
    if (!c) return null;
    if (c.tag !== "aliasColumn") return c;
    const key = `${this.fullname}.${path}`;
    if (seen.has(key)) fail(`Cyclic alias: ${key}`);
    seen = new Set(seen).add(key);
    const original = this.column(c.attributes.relation_path, seen);
    if (!original)
      fail(`Unknown column ${this.fullname}.${c.attributes.relation_path}`);
    const attributes = {
      ...original.attributes,
      ...Object.fromEntries(
        Object.entries(c.attributes).filter(
          ([k]) =>
            !["relation_path", "tag"].includes(k) &&
            !c.signatureDefaults.includes(k),
        ),
      ),
    };
    return new Proxy(original, {
      get: (o, k) =>
        k === "originalColumn"
          ? original
          : k === "relation_path"
            ? c.attributes.relation_path
            : k === "attributes"
              ? attributes
              : k === "dtype"
                ? attributes.dtype || original.dtype
                : Reflect.get(o, k),
    });
  }
  toJSON() {
    return {
      name: this.name,
      tag: this.tag,
      attributes: copy(this.attributes),
      children: this.values().map((c) => c.toJSON()),
      signatureDefaults:
        this.tag === "aliasColumn" ? [...this.signatureDefaults] : [],
      generated: this.generated,
    };
  }
}
export class RelationTree {
  constructor(model, table) {
    this.model = model;
    this.table = table;
  }
  entries() {
    const result = new Map(),
      t = this.table;
    for (const c of t.columns.values())
      result.set(c.name, {
        label: c.name,
        attributes: {
          ...copy(c.attributes),
          dtype: c.dtype,
          table: t.name,
          pkg: t.pkg.name,
        },
        value: null,
      });
    for (const [path, a] of this.model.relations)
      if (path.startsWith(t.fullname + ".")) {
        const label = path.slice(t.fullname.length + 1),
          remote = this.model.table(
            a.mode === "O" ? a.one_relation : a.many_relation,
          );
        const attrs = { joiner: copy(a) };
        if (a.mode === "O") {
          const name = a.many_relation.split(".").at(-1),
            c =
              t.columns.get(name) ||
              t.virtual_columns.get(name) ||
              t.composites?.get(name);
          Object.assign(attrs, copy(c.attributes), { dtype: c.dtype });
        }
        result.set(label, {
          label,
          attributes: attrs,
          get value() {
            return new RelationTree(remote.model, remote);
          },
        });
      }
    return result;
  }
  getNode(path) {
    const i = path.indexOf(".");
    return i < 0
      ? this.entries().get(path) || null
      : this.entries()
          .get(path.slice(0, i))
          ?.value?.getNode(path.slice(i + 1)) || null;
  }
  get(path) {
    return this.getNode(path)?.value ?? null;
  }
  keys() {
    return [...this.entries().keys()];
  }
}
export class DbModel {
  constructor(fragment) {
    this.implementation = fragment.attributes.implementation || "sqlite";
    this.relations = new Map();
    const ns =
      fragment.children.find((c) => ["packages", "schemas"].includes(c.tag)) ||
      makeNode("packages");
    this.db = new ModelNode(
      { ...fragment, children: fragment.children.filter((c) => c !== ns) },
      this,
    );
    this.obj = new ModelNode(ns, this);
    this.name = this.db.attributes.name || this.db.name;
    this.buildRelations();
  }
  get namespaces() {
    return this.obj;
  }
  get packages() {
    return this.obj.tag === "packages" ? this.obj : null;
  }
  get tables() {
    return new Map(
      this.obj
        .values()
        .flatMap((p) => (p.tables?.values() || []).map((t) => [t.fullname, t])),
    );
  }
  package(name) {
    return this.packages?.get(name) || null;
  }
  table(name, pkg = null) {
    if (name.includes(".")) [pkg, name] = name.split(".");
    if (pkg == null) fail("table() requires package.table");
    return this.obj.get(pkg)?.table(name) || null;
  }
  column(name) {
    const [pkg, t, ...rest] = name.split(".");
    return this.table(t, pkg)?.column(rest.join(".")) || null;
  }
  physicalColumns(table, name) {
    const c = table.column(name);
    if (!c) fail(`unknown column ${table.fullname}.${name}`);
    return c.tag === "compositeColumn" ? names(c.attributes.columns) : [name];
  }
  register(table, column, a) {
    const virtual = column.tag !== "column";
    a = { ...a };
    if (virtual)
      Object.assign(a, {
        virtual: true,
        one_name: a.one_name || column.name_long,
      });
    const parts = a.to.split(".");
    if (parts.length === 2 && !this.obj.get(parts[0]))
      parts.unshift(table.pkg.name);
    const remote = this.table(parts.slice(0, 2).join("."));
    if (!remote) fail(`unknown relation target ${a.to}`);
    if (parts.length === 2) parts.push(remote.pkey);
    const rc = remote.column(parts[2]);
    if (!rc) fail(`unknown target column ${a.to}`);
    const local =
        virtual && column.tag !== "compositeColumn"
          ? [column.name]
          : this.physicalColumns(table, column.name),
      distant = this.physicalColumns(remote, rc.name);
    if (local.length !== distant.length) fail("relation column counts differ");
    const many = `${table.fullname}.${column.name}`,
      inverse =
        a.relation_name ||
        (a.one_one === "*" ? table.name : many.replaceAll(".", "_"));
    const action = (v) =>
      v == null
        ? null
        : v.split(":")[0].toLowerCase().replaceAll(" ", "") === "noaction"
          ? null
          : v.split(":")[0].toLowerCase().replaceAll(" ", "") +
            (v.includes(":") ? v.slice(v.indexOf(":")) : "");
    const common = {
      many_relation: many,
      one_relation: parts.join("."),
      many_rel_name: a.many_name ?? null,
      one_rel_name: a.one_name || column.attributes.name_long || null,
      many_order_by: a.many_order_by ?? null,
      one_one: a.one_one ?? null,
      onDelete: action(a.onDelete),
      onDelete_sql: action(a.onDelete_sql),
      onUpdate: action(a.onUpdate),
      onUpdate_sql: action(a.onUpdate_sql || "cascade"),
      onDuplicate: a.onDuplicate ?? null,
      deferred: a.deferred ?? null,
      private_relation: !a.relation_name && a.one_one !== "*",
      case_insensitive: a.case_insensitive ?? false,
      one_group: a.one_group ?? null,
      many_group: a.many_group ?? null,
    };
    for (const k of [
      "eager_one",
      "eager_many",
      "external_relation",
      "storefield",
      "between",
      "cnd",
      "join_on",
      "virtual",
    ])
      common[k] = a[k] ?? null;
    for (const [path, attrs] of [
      [
        `${table.fullname}.@${a.name || column.name}`,
        {
          ...common,
          mode: "O",
          foreignkey: !!a.foreign_key,
          relation_name: inverse,
          resolver_kwargs: copy(a.resolver_kwargs || {}),
        },
      ],
      [
        `${remote.fullname}.@${inverse}`,
        { ...common, mode: "M", one_rel_name: a.one_name ?? null },
      ],
    ]) {
      if (this.relations.has(path)) fail(`Duplicate relation: ${path}`);
      this.relations.set(path, present(attrs));
    }
    if (!virtual)
      for (const [owner, fs] of [
        [table, local],
        [remote, distant],
      ]) {
        const pk = names(owner.pkey).flatMap((n) =>
          this.physicalColumns(owner, n),
        );
        if (
          JSON.stringify(fs) === JSON.stringify(pk) ||
          (fs.length === 1 && pk.includes(fs[0])) ||
          (owner === table && a.indexed === false)
        )
          continue;
        owner.addIndex(fs.join(","));
      }
  }
  buildRelations() {
    for (const t of this.tables.values())
      for (const c of [
        ...t.columns.values(),
        ...t.virtual_columns.values(),
        ...(t.composites?.values() || []),
      ]) {
        const ds = c
          .values()
          .filter((n) => ["relation", "weak_relation"].includes(n.tag));
        if (ds.length > 1) fail("Multiple relations");
        for (const d of ds) {
          const a = copy(d.attributes);
          for (const k of ["one_one", "deferred"])
            if (d.signatureDefaults.includes(k) && a[k] === false) delete a[k];
          this.register(t, c, a);
        }
      }
    const aliases = new Map(
      [...this.tables.values()].flatMap((t) =>
        t.virtual_columns
          .values()
          .filter((c) => c.tag === "aliasColumn")
          .map((c) => [c.fullname, c]),
      ),
    );
    const forward = new Map(
        [...this.relations.values()]
          .filter((a) => a.mode === "O")
          .map((a) => [a.many_relation, a]),
      ),
      active = new Set(),
      done = new Set();
    const target = (table, path) => {
      const ps = path.replace(/^\$/, "").split(".");
      for (const p of ps.slice(0, -1)) {
        let rel = this.relations.get(`${table.fullname}.${p}`);
        if (!rel) {
          const a = aliases.get(`${table.fullname}.${p.replace(/^@/, "")}`);
          if (a) {
            inherit(a);
            rel = this.relations.get(`${table.fullname}.${p}`);
          }
        }
        if (!rel) return null;
        table = this.table(
          rel.mode === "O" ? rel.one_relation : rel.many_relation,
        );
      }
      const n = ps.at(-1);
      return (
        table.columns.get(n) ||
        table.virtual_columns.get(n) ||
        table.composites?.get(n)
      );
    };
    const inherit = (c) => {
      const key = c.fullname;
      if (active.has(key) || done.has(key)) return forward.get(key);
      active.add(key);
      const dst = target(c.ownerTable, c.attributes.relation_path);
      let rel = dst ? forward.get(dst.fullname) : null;
      if (dst?.tag === "aliasColumn") rel = inherit(dst);
      if ((forward.has(key) || rel) && dst && !c.attributes.dtype)
        c.attributes.dtype = dst.dtype;
      if (!forward.has(key) && rel) {
        this.register(c.ownerTable, c, {
          to: rel.one_relation,
          foreign_key: false,
        });
        c.attributes.virtual = true;
        forward.set(
          key,
          this.relations.get(`${c.ownerTable.fullname}.@${c.name}`),
        );
      }
      active.delete(key);
      done.add(key);
      return forward.get(key);
    };
    for (const c of aliases.values()) inherit(c);
  }
  relationEntries() {
    const packages = new Map();
    for (const entry of this.relations) {
      const [p, t] = entry[0].split(".");
      if (!packages.has(p)) packages.set(p, new Map());
      const tables = packages.get(p);
      if (!tables.has(t)) tables.set(t, []);
      tables.get(t).push(entry);
    }
    return [...packages.values()].flatMap((ts) => [...ts.values()].flat());
  }
  toJSON() {
    return {
      format: "asqueel-model",
      version: 1,
      reference: "0.6.1",
      database: this.db.toJSON(),
      namespaces: this.obj.toJSON(),
      relations: this.relationEntries().map(([path, attributes]) => ({
        path,
        attributes: copy(attributes),
      })),
    };
  }
  static fromJSON(document) {
    const d =
      typeof document === "string" ? JSON.parse(document) : copy(document);
    if (
      d.format !== "asqueel-model" ||
      d.version !== 1 ||
      d.reference !== "0.6.1"
    )
      fail("Unsupported model JSON contract");
    // Restore the already-resolved graph without replaying expansions or registering edges twice.
    const model = Object.create(DbModel.prototype);
    model.implementation = d.database.attributes.implementation || "sqlite";
    model.relations = new Map(d.relations.map((r) => [r.path, r.attributes]));
    model.db = new ModelNode(d.database, model);
    model.obj = new ModelNode(d.namespaces, model);
    model.name = model.db.attributes.name || model.db.name;
    return model;
  }
  toMigration() {
    return projectModel(this).toMigration();
  }
}
export function resolveModel(builder) {
  return new DbModel(prepare(builder));
}
export function modelToJSON(model) {
  return model.toJSON();
}
export const modelFromJSON = DbModel.fromJSON;
function projectModel(model) {
  const b = new PhysicalBuilder(),
    db = b.root.db({ name: model.name }),
    schemas = db.schemas(),
    sns = new Map(),
    owners = new Map();
  const schema = (n) => {
    if (!sns.has(n)) sns.set(n, schemas.schema({ name: n }).tables());
    return sns.get(n);
  };
  for (const p of model.namespaces.values()) schema(p.sqlschema);
  const map = (t, raw) =>
    names(raw)
      .flatMap((n) => model.physicalColumns(t, n))
      .map((n) => t.columns.get(n).sqlname);
  const physicalTables = new Set();
  for (const t of model.tables.values()) {
    if (!sns.has(t.sqlschema) && t.pkg.tag === "package")
      fail("table sqlschema is not derived from a package");
    const path = t.sqlschema + "." + t.sqlname;
    if (physicalTables.has(path)) fail("duplicate physical table");
    physicalTables.add(path);
    const node = schema(t.sqlschema).table({
        name: t.sqlname,
        ...(t.pkey ? { pkey: map(t, t.pkey).join(",") } : {}),
        ...(t.attributes.comment ? { comment: t.attributes.comment } : {}),
      }),
      cols = node.columns(),
      seen = new Set();
    for (const c of t.columns.values()) {
      if (seen.has(c.sqlname)) fail("duplicate physical columns");
      seen.add(c.sqlname);
      const a = c.attributes;
      if (
        a.identity_kind ||
        a.generated ||
        a.default_collation === false ||
        a.owned_sequence ||
        a.sequence_default
      )
        fail("unsupported physical column metadata");
      let dtype = c.dtype;
      const attrs = present(
        Object.fromEntries(
          ["size", "notnull", "unique", "indexed", "comment"].map((k) => [
            k,
            a[k],
          ]),
        ),
      );
      const dialect = model.implementation.startsWith("postgres")
        ? "pg"
        : model.implementation.split(":")[0];
      for (const [key, out] of Object.entries({
        default: "sqldefault",
        extra: "extra_sql",
        generatedExpression: "generated_expression",
      })) {
        const value = own(a, `sql_${dialect}_${key}`)
          ? a[`sql_${dialect}_${key}`]
          : a[`sql_${key}`];
        if (value != null) attrs[out] = value;
      }
      // Rich indexed specifications are projected by the hierarchy's index objects.
      if (typeof attrs.indexed === "object") {
        if (
          attrs.indexed.where ||
          (attrs.indexed.method && attrs.indexed.method !== "btree")
        )
          fail("partial/non-btree index does not cover required full index");
        if (attrs.indexed.unique) attrs.unique = true;
        delete attrs.indexed;
      }
      if (t.pkg.tag === "package") {
        dtype = { X: "T", Z: "T", P: "T" }[dtype] || dtype;
        if (attrs.size) {
          if (attrs.size.includes(":")) {
            attrs.size = "0:" + attrs.size.split(":")[1];
            dtype = "A";
          } else if (!attrs.size.includes(",")) {
            if (["A", "T"].includes(dtype)) dtype = "C";
            else if (dtype === "N") attrs.size += ",0";
          }
        } else if (["A", "C"].includes(dtype)) dtype = "T";
      }
      owners.set(c.fullname, cols.column({ name: c.sqlname, dtype, ...attrs }));
    }
    if (t.composites) {
      const cs = node.composites();
      for (const c of t.composites.values())
        owners.set(
          c.fullname,
          cs.compositeColumn({
            name: c.name,
            columns: map(t, c.attributes.columns).join(","),
            unique: c.attributes.unique || false,
          }),
        );
    }
    const remapped = t.columns.values().some((c) => c.sqlname !== c.name);
    if (t.get("constraints")) {
      const cs = node.constraints();
      for (const c of t.get("constraints").values()) {
        const a = c.attributes;
        if (a.check_clause && remapped) fail("CHECK with remapped columns");
        cs.constraint({
          name: c.name,
          ...present({
            constraint_type: a.constraint_type,
            columns: a.columns ? map(t, a.columns).join(",") : null,
            check_clause: a.check_clause,
          }),
        });
      }
    }
    const pk = map(t, t.pkey);
    for (const i of t.indexes.values()) {
      const a = i.attributes,
        ns = names(a.columns);
      if (
        i.generated &&
        (JSON.stringify(ns.map((n) => t.columns.get(n).sqlname)) ===
          JSON.stringify(pk) ||
          (ns.length === 1 && t.columns.get(ns[0]).attributes.unique))
      )
        continue;
      if (a.where && remapped) fail("partial index with remapped columns");
      const anonymous = i.name === idxName(t.name, ns),
        mapped = map(t, a.columns);
      node.indexes().index({
        name: anonymous ? `auto_${i.name}` : i.name,
        x_auto_name: anonymous,
        columns:
          typeof a.columns === "object"
            ? Object.fromEntries(ns.map((n, j) => [mapped[j], a.columns[n]]))
            : mapped.join(","),
        ...present(
          Object.fromEntries(contract.indexOptions.map((k) => [k, a[k]])),
        ),
      });
    }
  }
  for (const a of model.relations.values())
    if (a.mode === "O" && a.foreignkey) {
      const parts = a.many_relation.split("."),
        rparts = a.one_relation.split("."),
        t = model.table(a.many_relation),
        remote = model.table(a.one_relation),
        c = t.column(parts[2]),
        target =
          remote.composites?.get(rparts[2]) || remote.columns.get(rparts[2]);
      const owner = owners.get(a.many_relation);
      if (!owner || !target) fail("physical FK on virtual column");
      const attrs = c.values().find((n) => n.tag === "relation").attributes,
        projected = {
          on_update: "CASCADE",
          ...present(
            Object.fromEntries(
              [
                "deferrable",
                "initially_deferred",
                "deferred",
                "indexed",
                "constraint_name",
              ].map((k) => [k, attrs[k]]),
            ),
          ),
        };
      for (const [k, out] of [
        ["onDelete_sql", "on_delete"],
        ["onUpdate_sql", "on_update"],
      ])
        if (attrs[k] != null)
          projected[out] = sqlActions[attrs[k].toLowerCase()];
      owner.relation({
        to: `${remote.sqlschema}.${remote.sqlname}.${target.tag === "compositeColumn" ? target.name : target.sqlname}`,
        foreign_key: true,
        ...projected,
      });
    }
  const ex = model.db.get("extensions");
  if (ex) {
    const es = db.extensions();
    for (const e of ex.values()) es.extension({ name: e.name });
  }
  return b;
}
/** Python's renderer retains a direct physical-schema path when no options/packages exist. */
export function migrationForBuilder(builder) {
  const source = builder.toSource();
  const application = (ns) =>
    ns.some(
      (n) => ["packages", "options"].includes(n.tag) || application(n.children),
    );
  if (application(source)) return resolveModel(builder).toMigration();
  const errors = builder.validateSource();
  if (errors.length) fail(JSON.stringify(errors));
  if (source.length !== 1 || source[0].tag !== "db")
    fail("exactly one db root is required");
  prepare(builder); // Domain-check the source independently of object-tree navigation.
  const physical = new PhysicalBuilder();
  const walk = (nodes, parent) => {
    for (const n of nodes) {
      if (["colgroup", "virtualRelation"].includes(n.tag)) continue;
      const spec = grammar.elements[n.tag];
      if (!spec) fail(`Unsupported model element ${n.tag}`);
      const declared = new Set(spec.attributes.parameters.map((p) => p.name));
      for (const k of Object.keys(n.attributes))
        if (k !== "_meta" && !declared.has(k) && !attrsAllowed(n.tag, k))
          fail(`${n.tag}: unknown attribute ${k}`);
      if (
        !physical.schema[n.tag] ||
        ["validation", "encryption", "dynamic_fields"].includes(n.tag)
      )
        continue;
      const a = copy(n.attributes);
      delete a._meta;
      for (const [key, out] of [
        ["sql_default", "sqldefault"],
        ["sql_extra", "extra_sql"],
        ["sql_generatedExpression", "generated_expression"],
      ]) {
        const engine = source[0].attributes.implementation || "sqlite";
        const dialect = engine.startsWith("postgres")
          ? "pg"
          : engine.split(":")[0];
        const value = own(a, `sql_${dialect}_${key.slice(4)}`)
          ? a[`sql_${dialect}_${key.slice(4)}`]
          : a[key];
        if (value != null) a[out] = value;
        delete a[key];
      }
      if (n.tag === "relation") {
        if (
          [
            "formulaColumn",
            "aliasColumn",
            "pyColumn",
            "subQueryColumn",
            "bagItemColumn",
          ].includes(parent.nodeTag) &&
          !a.foreign_key
        )
          continue;
        for (const [k, out] of [
          ["onDelete_sql", "on_delete"],
          ["onUpdate_sql", "on_update"],
        ]) {
          if (a[k] != null) {
            if (!own(sqlActions, a[k].toLowerCase())) fail(`invalid ${k}`);
            a[out] = sqlActions[a[k].toLowerCase()];
          }
        }
        if (a.foreign_key && !own(a, "on_update")) a.on_update = "CASCADE";
      }
      if (
        n.tag === "index" &&
        a.name ===
          idxName(
            parent?.label === "indexes"
              ? parent.parentBag?.parentNode?.label
              : "",
            a.columns,
          )
      )
        a.x_auto_name = true;
      // Physical fields are selected by the migrator; presentation stays in resolve().
      const supported = new Set(
        physical.schema[n.tag].attributes.parameters.map((p) => p.name),
      );
      const attrs = Object.fromEntries(
        Object.entries(a).filter(
          ([k]) => supported.has(k) || ["x_auto_name", "x_weak"].includes(k),
        ),
      );
      for (const k of ["sqlname", "sqlschema", "pkey_columns"]) delete attrs[k];
      const next = parent[n.tag](attrs);
      walk(n.children, next);
    }
  };
  walk(source, physical.root);
  return physical.toMigration();
}
