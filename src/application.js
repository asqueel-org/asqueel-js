// SQLite compiler view of the hierarchical model, including incoming relations.
// All preparation now belongs to the public 0.6.1 hierarchical model.
import { resolveModel } from "./model.js";
export function projectApplication(
  builder,
  _Builder,
  { withModel = false } = {},
) {
  const model = resolveModel(builder),
    tables = new Map();
  const node = (n) => ({
    tag: n.tag,
    label: n.name,
    a: structuredClone(n.attributes),
    children: n.values().map(node),
  });
  for (const t of model.tables.values()) {
    const map = (nodes) =>
      new Map((nodes?.values() || []).map((c) => [c.name, node(c)]));
    const relations = new Map();
    for (const [name, relation] of t.relations.entries())
      relations.set(name.replace(/^@/, ''), {kind: 'ordinary', joiner: structuredClone(relation.attributes.joiner)});
    for (const n of t.values())
      if (n.tag === "virtualRelation")
        relations.set(n.attributes.name, { kind: "virtual", a: structuredClone(n.attributes) });
    const columns = map(t.columns);
    // Keep existing query guards for unimplemented lifecycle actions.
    for (const c of columns.values())
      for (const r of c.children)
        if (r.tag === "relation") {
          for (const [a, old] of [
            ["onDelete", "x_app_on_delete"],
            ["onUpdate", "x_app_on_update"],
          ])
            if (r.a[a] != null) r.a[old] = r.a[a];
        }
    tables.set(t.fullname, {
      key: t.fullname,
      namespace: t.pkg.name,
      a: structuredClone(t.attributes),
      sqlname: t.sqlname,
      sqlschema: t.sqlschema,
      columns,
      virtual: map(t.virtual_columns),
      composites: map(t.composites),
      relations,
      options: new Map(
        (t.options?.values() || []).map((o) => [
          o.name,
          { tag: o.tag, spec: structuredClone(o.attributes) },
        ]),
      ),
      declarations: t
        .values()
        .filter((n) => ["colgroup", "virtualRelation"].includes(n.tag))
        .map((n) => ({
          kind: n.tag,
          name: n.name,
          attributes: structuredClone(n.attributes),
        })),
      mapColumns: (names) => names.map((n) => t.columns.get(n).sqlname),
    });
  }
  return withModel ? { model, tables } : model;
}
