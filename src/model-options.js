// Structural port of Asqueel model_expansion.py. No hooks are executed.
import { defaults } from "./options.js";
import { names } from "./structures.js";
import { UnsupportedFeatureError } from "./query-errors.js";
const clone = structuredClone;
const fail = (message) => {
  throw new Error(message);
};
const unsupported = (message) => {
  throw new UnsupportedFeatureError(message);
};
export const makeNode = (tag, name = tag, attributes = {}, children = []) => ({
  tag,
  name,
  attributes,
  children,
  generated: false,
  defaults: [],
});
export const child = (node, name) => node.children.find((c) => c.name === name);
export function container(node, name) {
  let found = child(node, name);
  if (!found) node.children.push((found = makeNode(name)));
  return found;
}
const fields = (t) =>
  ["columns", "virtual_columns", "composites"].flatMap(
    (k) => child(t, k)?.children || [],
  );
class Expansion {
  constructor(key, table) {
    this.key = key;
    this.table = table;
    this.emitted = { columns: [], virtual_columns: [] };
  }
  spec(tag) {
    const n = child(child(this.table, "options") || { children: [] }, tag);
    return n && n.attributes.enabled !== false
      ? { ...defaults(tag), ...n.attributes }
      : null;
  }
  get group() {
    return this.spec("sysFields")?.group || "_";
  }
  node(name) {
    return fields(this.table).find((n) => n.name === name);
  }
  add(name, dtype = "T", a = {}, required = {}, kind = "column") {
    const existing = this.node(name),
      structure = { dtype, ...required };
    if (existing && existing.tag !== kind)
      fail(`${this.key}.${name}: conflicts with option element kind`);
    const previous = existing
      ? Object.fromEntries(
          Object.entries(existing.attributes).filter(
            ([k]) => !existing.defaults.includes(k),
          ),
        )
      : {};
    for (const [k, v] of Object.entries(structure))
      if (
        previous[k] != null &&
        JSON.stringify(previous[k]) !== JSON.stringify(v)
      )
        fail(`${this.key}.${name}: conflicts with option ${k}`);
    if (kind !== "column")
      for (const k of ["sql_formula", "select", "method"])
        if (
          k in previous &&
          k in a &&
          JSON.stringify(previous[k]) !== JSON.stringify(a[k])
        )
          fail(`${this.key}.${name}: conflicts with option ${k}`);
    const node = existing || makeNode(kind, name),
      collection = container(
        this.table,
        kind === "column" ? "columns" : "virtual_columns",
      );
    node.attributes = {
      ...(existing?.attributes || {}),
      ...a,
      ...previous,
      ...structure,
      name,
    };
    if (!existing) collection.children.push(node);
    const emitted = this.emitted[collection.name];
    if (!emitted.includes(name)) {
      collection.children.splice(collection.children.indexOf(node), 1);
      collection.children.splice(emitted.length, 0, node);
      emitted.push(name);
    }
    return node;
  }
  formula(name, formula = null, a = {}) {
    return this.add(
      name,
      a.dtype || "A",
      { sql_formula: formula, ...a },
      {},
      "formulaColumn",
    );
  }
  tableDefault(a) {
    for (const [k, v] of Object.entries(a))
      if (!(k in this.table.attributes)) this.table.attributes[k] = v;
  }
  relation(col, to, a = {}) {
    const existing = col.children.filter((n) => n.tag === "relation");
    if (existing.length > 1) fail(`${this.key}: multiple relations`);
    if (existing.length) {
      const n = existing[0],
        old = n.attributes;
      if (
        old.related_column !== to &&
        `${this.key.split(".")[0]}.${old.related_column}` !== to
      )
        fail("conflicting generated relation");
      for (const [k, v] of Object.entries(a))
        if (
          k in old &&
          !n.defaults.includes(k) &&
          JSON.stringify(old[k]) !== JSON.stringify(v)
        )
          fail(`conflicting relation ${k}`);
      Object.assign(old, a);
    } else
      col.children.push(
        makeNode("relation", "relation_0", {
          related_column: to,
          foreign_key: true,
          ...a,
        }),
      );
  }
  systemColumns() {
    const s = this.spec("sysFields");
    if (!s) return;
    const group = s.group || "_";
    if (s.group && s.group_name)
      this.tableDefault({ [`group_${group}`]: s.group_name });
    const definitions = {
      id: [
        "id",
        "A",
        "Id",
        { size: "22", readOnly: true },
      ],
      ins: [
        "__ins_ts",
        "DHZ",
        "Insert date",
        { indexed: true, onInserting: "setTSNow" },
      ],
      ldel: ["__del_ts", "DHZ", "Logical delete date", { indexed: true }],
      upd: [
        "__mod_ts",
        "DHZ",
        "Update date",
        { indexed: true, onInserting: "setTSNow", onUpdating: "setTSNow" },
      ],
      user_ins: [
        "__ins_user",
        "T",
        "User Insert",
        { onInserting: "setCurrentUser" },
      ],
      user_upd: [
        "__mod_user",
        "T",
        "User Modify",
        { onInserting: "setCurrentUser", onUpdating: "setCurrentUser" },
      ],
      draft: [
        "__is_draft",
        "B",
        "Is Draft",
        { indexed: true },
      ],
      syscode: [
        "__syscode",
        "A",
        "Internal code",
        { size: ":20", indexed: true, unique: true },
      ],
    };
    for (const [setting, [name, dtype, label, attrs]] of Object.entries(
      definitions,
    )) {
      if (s[setting] === false) continue;
      const custom = typeof s[setting] === "object" ? clone(s[setting]) : {};
      delete custom.type;
      this.add(
        name,
        dtype,
        {
          group,
          name_long: "!![en]" + label,
          ...attrs,
          ...custom,
        },
        setting === "id"
          ? { size: "22" }
          : setting === "syscode"
            ? { size: ":20", indexed: true, unique: true }
            : {},
      );
    }
    if (s.id !== false) this.tableDefault({ pkey: "id" });
    for (const [flag, key, value] of [
      ["ldel", "logicalDeletionField", "__del_ts"],
      ["upd", "lastTS", "__mod_ts"],
      ["draft", "draftField", "__is_draft"],
    ])
      if (s[flag] !== false) this.tableDefault({ [key]: value });
    const pk = this.table.attributes.pkey;
    if (pk)
      this.formula("__record_pointer", ` '${this.key}.' || $${pk} `, {
        group,
        name_long: "!![en]Record pointer",
      });
    for (const [name, expression, label] of [
      ["__protecting_reasons", true, "Protecting reasons"],
      ["__is_protected_row", "$__protecting_reasons!=''", "Row Protected"],
      ["__invalid_reasons", true, "Invalid reasons"],
      ["__is_invalid_row", "$__invalid_reasons!=''", "Invalid row"],
    ])
      this.formula(name, expression, {
        group: this.group,
        name_long: "!![en]" + label,
      });
  }
  local() {
    let s;
    if ((s = this.spec("fullUpd")))
      this.add(s.field, "DHZ", {
        indexed: true,
        group: this.group,
        name_long: "!![en]Full Update TS",
      });
    if ((s = this.spec("df"))) {
      this.add("df_fields", "X", { group: "_" });
      this.add("df_fbcolumns", "L", { group: "_" });
      this.add("df_custom_templates", "X", { group: "_" });
      this.add("df_colswidth", "T", { group: "_" });
    }
    if ((s = this.spec("counter"))) {
      this.add(s.field, "L", {
        group: this.group,
        name_long: "!![en]Counter",
        ...(!this.spec("hierarchical") ? { onInserting: "setRowCounter" } : {}),
      });
      if (!this.spec("hierarchical"))
        this.tableDefault({ order_by: "$" + s.field });
    }
  }
  hierarchy() {
    const s = this.spec("hierarchical");
    if (!s) return;
    if (s.depth)
      unsupported(`${this.key}: hierarchical depth is not available in this release`);
    if (
      this.table.attributes.pkey !== "id" ||
      this.node("id")?.attributes.size !== "22"
    )
      fail("hierarchical requires id size 22 as primary key");
    const p = s.parent,
      counter = this.spec("counter");
    this.relation(
      this.add(
        p,
        "A",
        {
          group: "*",
          name_long: "!![en]Parent id",
          onInserting: "hierarchical_before",
          onUpdating: "hierarchical_before",
          onUpdated: "hierarchical_after",
        },
        { size: "22" },
      ),
      this.key + ".id",
      {
        relation_name: "_children",
        deferred: true,
        onDelete: "cascade",
        one_name: "!![en]Parent",
        many_name: "!![en]Children",
        one_group: this.group,
        many_group: this.group,
      },
    );
    this.formula("child_count", null, {
      dtype: "L",
      group: "*",
      select: { table: this.key, where: `$${p}=#THIS.id`, columns: "COUNT(*)" },
    });
    this.formula(
      "hlevel",
      "length($hierarchical_pkey)-length(replace($hierarchical_pkey,'/',''))+1",
      { group: "*" },
    );
    if (s.root_id)
      this.relation(
        this.add(
          "root_id",
          "A",
          {
            group: "*",
            sql_value: "substr(:hierarchical_pkey,1,22)",
          },
          { size: "22" },
        ),
        this.key + ".id",
        {
          relation_name: "_grandchildren",
          deferred: true,
          onDelete: "ignore",
          one_name: "!![en]Root",
          many_name: "!![en]Grandchildren",
        },
      );
    if (s.virtual_roots)
      this.add("_virtual_node", "B", { name_long: "!![en]H.Virtual node" });
    const fs = [];
    for (const item of typeof s.columns === "string"
      ? names(s.columns)
      : s.columns || []) {
      const n = typeof item === "object" ? item.name : item;
      if (n === "pkey") continue;
      if (!this.node(n)) fail(`unknown hierarchical field ${n}`);
      this.add(
        "hierarchical_" + n,
        "T",
        { name_long: "!![en]Hierarchical " + n, hierarchical_field_of: n },
        { unique: typeof item === "object" ? (item.unique ?? false) : false },
      );
      this.add("_parent_h_" + n, "T", {
        group: this.group,
        name_long: "!![en]Parent Hierarchical " + n,
      });
      fs.push(n);
    }
    this.add(
      "hierarchical_pkey",
      "T",
      {
        group: this.group,
        name_long: "!![en]Hierarchical pkey",
      },
      { unique: true },
    );
    this.add("_parent_h_pkey", "T", { group: this.group });
    fs.push("pkey");
    if (s.caption_field) this.tableDefault({ caption_field: s.caption_field });
    if (counter) {
      if (counter.scope)
        fail("hierarchical counter cannot have a relative scope");
      for (const n of ["_h_count", "_parent_h_count"])
        this.add(n, "T", { group: this.group });
      this.formula(
        "_h_sortcol",
        fs.length === 1 ? "$_h_count" : ` COALESCE($_h_count,$${fs[0]}) `,
        { group: this.group },
      );
      this.tableDefault({ order_by: "$_h_sortcol" });
    } else this.tableDefault({ order_by: "$hierarchical_" + fs[0] });
  }
}
export function expandModelOptions(tables) {
  const owners = new Map([...tables].map(([k, t]) => [k, new Expansion(k, t)]));
  const target = (owner, ref) =>
    owners.get(ref.includes(".") ? ref : owner.key.split(".")[0] + "." + ref) ||
    fail(`unknown related table ${ref}`);
  for (const o of owners.values()) {
    o.systemColumns();
    o.local();
  }
  for (const o of owners.values()) o.hierarchy();
  for (const o of owners.values()) {
    const hierarchy = o.spec("hierarchical");
    if (hierarchy?.linked_to) {
      const master = target(o, hierarchy.linked_to),
        pk = master.table.attributes.pkey,
        column = pk ? master.node(pk) : null;
      if (!column || column.tag !== "column")
        fail(`${o.key}: linked hierarchy master needs a physical primary key`);
      const a = column.attributes,
        dtype = a.dtype || (a.size ? "A" : "T"),
        name = master.table.attributes.name;
      const col = o.add(
        `${name}_${pk}`,
        { serial: "L", serial4: "I" }[dtype] || dtype,
        {
          group: "_",
          name_long: master.table.attributes.name_long ?? null,
        },
        a.size ? { size: a.size } : {},
      );
      o.relation(col, `${master.key}.${pk}`, {
        relation_name: o.table.attributes.name + "s",
        onDuplicate: false,
        deferred: true,
        onDelete: "cascade",
      });
      const root = master.add(
        `root_${o.table.attributes.name}_id`,
        "A",
        {
          name_long: `${o.table.attributes.name_long ?? "None"} root`,
          onInserting: "insertLinkedHierarchicalRoot",
          onUpdating: "updateLinkedHierarchicalRoot",
        },
        { size: "22" },
      );
      master.relation(root, `${o.key}.id`, {
        one_one: "*",
        onDuplicate: false,
        onDelete_sql: "setnull",
        deferred: true,
      });
      o.tableDefault({ hierarchical_linked_to: master.key });
    }
  }
  for (const o of owners.values()) {
    const s = o.spec("relidx");
    if (!s) continue;
    const n = s.relation.replace(/^@+/, ""),
      rs = o.node(n)?.children.filter((n) => n.tag === "relation") || [];
    if (rs.length !== 1)
      fail("relidx needs a column with one direct relation");
    const parts = rs[0].attributes.related_column.split(".");
    if (parts.length === 2) parts.unshift(o.key.split(".")[0]);
    const master = target(o, parts.slice(0, 2).join(".")),
      xtd = target(o, master.key + "_xtd");
    o.add(s.field, "L", {
      name_long: "!![en]Rel.Idx",
      group: o.group,
      onInserting: "setRelidx",
    });
    xtd.add(o.key.replaceAll(".", "_") + "_relidx", "L", {
      name_long: `${o.table.attributes.name_long ?? "None"} relidx count`,
    });
  }
}
