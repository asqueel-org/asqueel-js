// Structural port of Asqueel 0.6.1 model_expansion.py. No hooks are executed.
import { defaults } from "./options.js";
import { names } from "./structures.js";
const clone = structuredClone;
const legacy = (a) =>
  Object.fromEntries(
    Object.entries(a).map(([k, v]) => [
      [
        "onInserting",
        "onUpdating",
        "onUpdated",
        "onInserted",
        "onDeleting",
        "onDeleted",
      ].includes(k)
        ? k
        : `x_legacy_${k}`,
      v,
    ]),
  );
const fail = (message) => {
  throw new Error(message);
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
    return this.spec("sys_fields")?.group || "_";
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
    if (kind === "formulaColumn")
      node.attributes.x_requires_compilation = "formulaColumn";
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
      if (old.to !== to && `${this.key.split(".")[0]}.${old.to}` !== to)
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
          to,
          foreign_key: true,
          ...a,
          ...(this.table.packaged ? { x_canonical: true } : {}),
        }),
      );
  }
  sysFields() {
    const s = this.spec("sys_fields");
    if (!s) return;
    const group = s.group || "_";
    if (s.group && s.group_name)
      this.tableDefault({ [`group_${group}`]: s.group_name });
    const definitions = {
      id: [
        "id",
        "A",
        "Id",
        {
          size: "22",
          read_only: true,
          x_generation: { type: "uuid", algorithm: "legacy22" },
          ...legacy({ _sendback: true }),
        },
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
        { indexed: true, ...legacy({ _sendback: true }) },
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
          ...legacy({ _sysfield: true }),
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
        ...legacy({ _sysfield: true }),
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
        ...legacy({ _sysfield: true }),
      });
  }
  local() {
    let s;
    if ((s = this.spec("full_update")))
      this.add(s.field, "DHZ", {
        indexed: true,
        group: this.group,
        name_long: "!![en]Full Update TS",
        ...legacy({ _sysfield: true }),
      });
    if ((s = this.spec("record_hash")))
      this.add(s.field, "T", {
        group: this.group,
        name_long: "!![en]Update date",
        ...legacy({
          _sysfield: true,
          onInserting: "setRecordMd5",
          onUpdating: "setRecordMd5",
        }),
      });
    if ((s = this.spec("audit"))) {
      this.tableDefault(legacy({ audit: s.mode }));
      this.add(s.version_field, "L", {
        group: this.group,
        name_long: "Audit version",
        ...legacy({
          _sysfield: true,
          onInserting: "setAuditVersionIns",
          onUpdating: "setAuditVersionUpd",
        }),
      });
    }
    if ((s = this.spec("dynamic_fields"))) {
      this.add("df_fields", "X", {
        group: "_",
        ...legacy({ _sendback: true }),
      });
      this.add("df_fbcolumns", "L", { group: "_" });
      this.add("df_custom_templates", "X", {
        group: "_",
        ...legacy({ templates: s.templates }),
      });
      this.add("df_colswidth", "T", { group: "_" });
    }
    if ((s = this.spec("auto_counter"))) {
      this.tableDefault(legacy({ counter: s.scope || true }));
      this.add(s.field, "L", {
        group: this.group,
        name_long: "!![en]Counter",
        ...legacy({
          counter: true,
          _sysfield: true,
          ...(!this.spec("hierarchical")
            ? { _counter_fkey: s.scope || true, onInserting: "setRowCounter" }
            : {}),
        }),
      });
      if (!this.spec("hierarchical"))
        this.tableDefault({ order_by: "$" + s.field });
    }
    if ((s = this.spec("protection"))?.tag) {
      this.add("__protection_tag", "T", {
        group: this.group,
        name_long: "!![en]Protection tag",
        ...legacy({
          _sysfield: true,
          _sendback: true,
          onInserting: "setProtectionTag",
        }),
      });
      this.formula(
        "__protected_by_tag",
        " ( CASE WHEN $__protection_tag IS NULL THEN NULL\n                                                    ELSE NOT (',' || :env_userTags || ',' LIKE '%%,'|| $__protection_tag || ',%%')\n                                                    END ) ",
        { dtype: "B", ...legacy({ _sysfield: true }) },
      );
    }
    for (const c of child(this.table, "columns")?.children || []) {
      const d = child(c, "dynamic_fields");
      if (d && d.attributes.enabled !== false)
        Object.assign(c.attributes, legacy({ subfields: d.attributes.source }));
    }
  }
  hierarchy() {
    const s = this.spec("hierarchical");
    if (!s) return;
    if (s.depth)
      fail(`${this.key}: hierarchical depth is not available in Python 0.6.1`);
    if (
      this.table.attributes.pkey !== "id" ||
      this.node("id")?.attributes.size !== "22"
    )
      fail("hierarchical requires id size 22 as primary key");
    const p = s.parent,
      counter = this.spec("auto_counter");
    this.relation(
      this.add(
        p,
        "A",
        {
          group: "*",
          name_long: "!![en]Parent id",
          ...legacy({
            _sysfield: true,
            onInserting: "hierarchical_before",
            onUpdating: "hierarchical_before",
            onUpdated: "hierarchical_after",
          }),
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
            ...legacy({ _sysfield: true }),
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
      this.add("_virtual_node", "B", {
        name_long: "!![en]H.Virtual node",
        ...legacy({ copyFromParent: true }),
      });
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
        ...legacy({ _sysfield: true }),
      });
      fs.push(n);
    }
    this.add(
      "hierarchical_pkey",
      "T",
      {
        group: this.group,
        name_long: "!![en]Hierarchical pkey",
        ...legacy({ _sysfield: true }),
      },
      { unique: true },
    );
    this.add("_parent_h_pkey", "T", {
      group: this.group,
      ...legacy({ _sysfield: true }),
    });
    fs.push("pkey");
    this.tableDefault(legacy({ hierarchical: fs.join(",") }));
    if (s.caption_field) this.tableDefault({ caption_field: s.caption_field });
    const broadcast = names(this.spec("broadcast")?.columns);
    if (!broadcast.includes(p)) broadcast.push(p);
    this.tableDefault(legacy({ broadcast: broadcast.join(",") }));
    if (counter) {
      if (counter.scope)
        fail("hierarchical auto_counter cannot have a relative scope");
      for (const n of ["_h_count", "_parent_h_count"])
        this.add(n, "T", { group: this.group, ...legacy({ _sysfield: true }) });
      this.formula(
        "_h_sortcol",
        fs.length === 1 ? "$_h_count" : ` COALESCE($_h_count,$${fs[0]}) `,
        { group: this.group, ...legacy({ _sysfield: true }) },
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
  for (const o of owners.values())
    if (o.spec("attachments")) {
      const opts = container(o.table, "options");
      for (const tag of ["sys_fields", "auto_counter"])
        if (!child(opts, tag))
          opts.children.push(
            makeNode(tag, tag, {
              ...defaults(tag),
              ...(tag === "auto_counter" ? { scope: "maintable_id" } : {}),
            }),
          );
    }
  for (const o of owners.values()) {
    o.sysFields();
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
          ...legacy({ copyFromParent: true, fkeyToMaster: true }),
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
          ...legacy({
            onInserting: "insertLinkedHierarchicalRoot",
            onUpdating: "updateLinkedHierarchicalRoot",
          }),
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
    const s = o.spec("attachments");
    if (!s) continue;
    const master = target(o, s.master),
      pk = master.table.attributes.pkey;
    if (!pk || !master.node(pk))
      fail("attachment master needs a physical primary key");
    master.tableDefault({ atc_attachmenttable: o.key });
    const label = master.table.attributes.name_long ?? "None";
    o.tableDefault({
      caption_field: "description",
      rowcaption: "$description",
      name_long: `${label}  Attachment`,
      name_plural: `${label} Attachments`,
    });
    const id = o.add(
      "id",
      "A",
      { group: "_", name_long: "Id" },
      { size: "22" },
    );
    if (id.attributes.name_long === "!![en]Id")
      Object.assign(id.attributes, { name_long: "Id", group: "_" });
    for (const [n, l] of [
      ["filepath", "!![en]Filepath"],
      ["filepath_hash", "MD5 hash"],
      ["filepath_original_name", "!![en]Original name"],
      ["external_url", "!![en]External url"],
      ["description", "!![en]Description"],
      ["mimetype", "!![en]Mimetype"],
      ["text_content", "!![en]Content"],
    ])
      o.add(n, "T", {
        name_long: l,
        ...(n === "filepath"
          ? {
              onDeleted: "onDeletedAtc",
              onInserted: "onInsertedAtc",
              onInserting: "checkExternalUrl",
            }
          : {}),
      });
    o.add("info", "X", { name_long: "!![en]Additional info" });
    o.add("is_foreign_document", "B", {
      name_long: "!![en][Is foreign document]",
      name_short: "!![en]Ext",
    });
    o.relation(
      o.add(
        "maintable_id",
        "A",
        { group: "*", name_long: master.table.attributes.name },
        { size: "22" },
      ),
      master.key + "." + pk,
      {
        relation_name: "atc_attachments",
        onDelete: "cascade",
        onDelete_sql: "cascade",
        onDuplicate: false,
        deferred: true,
      },
    );
    o.formula(
      "adapted_url",
      "CASE WHEN position('\\:' in $filepath)>0 THEN '/'||$filepath\n             ELSE '/_vol/' || $filepath\n            END",
      { group: "_" },
    );
    o.add(
      "fileurl",
      "T",
      {
        method: "filepath_endpoint_url",
        name_long: "Fileurl",
        required_columns: "$external_url,$filepath",
        static: true,
      },
      {},
      "pyColumn",
    );
    o.add(
      "missing_file",
      "B",
      { method: "pyColumn_missing_file", name_long: "Missing file" },
      {},
      "pyColumn",
    );
    o.add(
      "full_external_url",
      "T",
      { method: "pyColumn_full_external_url", name_long: "Full external url" },
      {},
      "pyColumn",
    );
  }
  for (const o of owners.values()) {
    const s = o.spec("relative_index");
    if (!s) continue;
    const n = s.relation.replace(/^@+/, ""),
      rs = o.node(n)?.children.filter((n) => n.tag === "relation") || [];
    if (rs.length !== 1)
      fail("relative_index needs a column with one direct relation");
    const parts = rs[0].attributes.to.split(".");
    if (parts.length === 2) parts.unshift(o.key.split(".")[0]);
    const master = target(o, parts.slice(0, 2).join(".")),
      xtd = target(o, master.key + "_xtd");
    o.add(s.field, "L", {
      name_long: "!![en]Rel.Idx",
      group: o.group,
      ...legacy({
        onInserting: "setRelidx",
        relidx: true,
        _relidx_fkey: n,
        _sysfield: true,
        format: "0000",
      }),
    });
    o.tableDefault(legacy({ relidx: n }));
    xtd.add(o.key.replaceAll(".", "_") + "_relidx", "L", {
      name_long: `${o.table.attributes.name_long ?? "None"} relidx count`,
    });
  }
}
