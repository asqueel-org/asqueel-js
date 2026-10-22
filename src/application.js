// SQLite compiler view of the hierarchical model, including incoming relations.
// All preparation now belongs to the public 0.7.0 hierarchical model.
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
    a: n.attributes,
    children: n.values().map(node),
  });
  for (const t of model.tables.values()) {
    const map = (nodes) =>
      new Map((nodes?.values() || []).map((c) => [c.name, node(c)]));
    const relations = new Map();
    for (const [name, relation] of t.relations.entries())
      relations.set(name.replace(/^@/, ''), {kind: 'ordinary', joiner: relation.attributes.joiner});
    for (const n of t.values())
      if (n.tag === "virtualRelation")
        relations.set(n.attributes.name, { kind: "virtual", a: n.attributes });
    const columns = map(t.columns);
    tables.set(t.fullname, {
      model: t,
      key: t.fullname,
      namespace: t.pkg.name,
      a: t.attributes,
      sqlname: t.sqlname,
      sqlschema: t.sqlschema,
      columns,
      virtual: map(t.virtual_columns),
      composites: map(t.composites),
      relations,
      options: new Map(
        (t.options?.values() || []).map((o) => [
          o.name,
          { tag: o.tag, spec: o.attributes },
        ]),
      ),
      declarations: t
        .values()
        .filter((n) => ["colgroup", "virtualRelation"].includes(n.tag))
        .map((n) => ({
          kind: n.tag,
          name: n.name,
          attributes: n.attributes,
        })),
      mapColumns: (names) => names.map((n) => t.columns.get(n).sqlname),
    });
  }
  return withModel ? { model, tables } : model;
}
