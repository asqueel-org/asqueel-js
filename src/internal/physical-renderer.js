import { SourceBag } from "@genrojs/builders";
import { CompositionBuilder } from "../composition.js";
import grammar from "./physical-grammar.json" with { type: "json" };
import contract from "../generated/contract.json" with { type: "json" };
import {
  names,
  clean,
  entity,
  indexItem,
  constraintItem,
  relationItem,
  put,
} from "../structures.js";

const SUPPORTED = new Set([
  "db",
  "schemas",
  "schema",
  "tables",
  "table",
  "columns",
  "column",
  "composites",
  "compositeColumn",
  "constraints",
  "constraint",
  "indexes",
  "index",
  "extensions",
  "extension",
  "virtual_columns",
  "formulaColumn",
  "aliasColumn",
  "subQueryColumn",
  "pyColumn",
  "bagItemColumn",
  "relation",
]);
const VIRTUAL = new Set([
  "formulaColumn",
  "aliasColumn",
  "subQueryColumn",
  "pyColumn",
  "bagItemColumn",
]);
const children = (node) =>
  node.value instanceof SourceBag ? node.value.getNodes() : [];
const attr = (node) => node.getAttr();
const fail = (node, message) => {
  throw new Error(`${node.fullpath || node.nodeTag}: ${message}`);
};
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const membersKey = (columns) => JSON.stringify(columns);

/** The vocabulary comes entirely from Python's canonical JSON export. */
export class PhysicalBuilder extends CompositionBuilder {
  static _name = "sql";
  static {
    this.defineGrammar(grammar);
  }

  /** No database connection or Python process is involved. */
  toMigration() {
    return new PhysicalRenderer(this).render();
  }
}

export function defineModel(populate) {
  const builder = new PhysicalBuilder();
  populate(builder.root, builder);
  return builder;
}

export function composeModels(...models) {
  return PhysicalBuilder.compose(...models);
}

/** Physical projection, with package/option preparation matching Python. */
export class PhysicalRenderer {
  constructor(builder) {
    this.builder = builder;
  }

  render() {
    const errors = this.builder.validateSource();
    if (errors.length) throw new Error(JSON.stringify(errors));
    this.tables = new Map();
    this.schemas = new Map();
    this.extensions = new Map();
    const roots = this.builder.source.getNodes();
    if (roots.length !== 1 || roots[0].nodeTag !== "db") {
      throw new Error("The model must contain exactly one db root");
    }
    const db = roots[0];
    this.walk(db);
    this.collect(db);
    for (const table of this.tables.values()) this.validateTable(table);
    const result = {
      root: {
        entity: "db",
        entity_name: attr(db).name,
        schemas: {},
        extensions: {},
        event_triggers: {},
      },
    };
    for (const name of this.schemas.keys()) {
      put(result.root.schemas, name, {
        entity: "schema",
        entity_name: name,
        tables: {},
        schema_name: name,
      });
    }
    for (const table of this.tables.values()) {
      put(
        result.root.schemas[table.schema].tables,
        table.name,
        this.renderTable(table),
      );
    }
    // 0.6.1 also indexes the referenced non-primary key of physical FKs.
    for (const table of this.tables.values())
      for (const { node } of table.relations) {
        if (attr(node).x_weak && !attr(node).foreign_key) continue;
        const remote = this.target(node),
          cols = remote.columns,
          t = remote.table;
        if (same(cols, names(attr(t.node).pkey))) continue;
        const output = result.root.schemas[t.schema].tables[t.name];
        if (cols.length === 1 && output.columns[cols[0]].attributes.unique)
          continue;
        if (
          Object.values(output.constraints).some(
            (c) =>
              c.attributes.constraint_type === "UNIQUE" &&
              same(c.attributes.columns, cols),
          )
        )
          continue;
        const index = indexItem(t.schema, t.name, cols, {
          columns: Object.fromEntries(cols.map((c) => [c, null])),
        });
        const old = output.indexes[index.entity_name];
        if (
          old &&
          (old.attributes.where ||
            (old.attributes.method && old.attributes.method !== "btree"))
        )
          fail(
            node,
            "partial/non-btree index does not cover required target index",
          );
        if (!old) put(output.indexes, index.entity_name, index);
      }
    for (const name of this.extensions.keys()) {
      put(result.root.extensions, name, {
        entity: "extension",
        entity_name: name,
        attributes: {},
      });
    }
    return result;
  }

  walk(node) {
    const tag = node.nodeTag;
    if (!SUPPORTED.has(tag))
      fail(node, `<${tag}> is outside the internal physical projection`);
    const attributes = attr(node);
    this.builder.validateNodeValues(tag, node.value, attributes);
    const declared = new Set([
      ...this.builder.schema[tag].attributes?.parameters?.map((p) => p.name),
      ...(attributes._meta?.inherited_attributes || []),
    ]);
    for (const key of Object.keys(attributes)) {
      if (key === "_meta") continue;
      if (
        key === "sql_type" ||
        (!declared.has(key) && !(key.includes("_") && !key.startsWith("_")))
      ) {
        fail(node, `unknown attribute ${key}`);
      }
    }
    // Logical-to-physical names must be resolved before entering this emitter.
    for (const key of [
      "sqlname",
      "sqlschema",
      "pkey_columns",
      "x_sql_name",
      "x_sql_schema",
    ]) {
      if (attributes[key] != null)
        fail(node, `${key} requires logical-to-physical model resolution`);
    }
    if (
      attributes.name != null &&
      (typeof attributes.name !== "string" || !attributes.name.trim())
    ) {
      fail(node, "name must be a nonempty string");
    }
    for (const child of children(node)) this.walk(child);
  }

  collect(db) {
    for (const container of children(db)) {
      if (container.nodeTag === "extensions") {
        for (const node of children(container))
          this.add(this.extensions, attr(node).name, node, node);
      }
      if (container.nodeTag !== "schemas") continue;
      for (const schema of children(container)) {
        const schemaName = attr(schema).name;
        this.add(this.schemas, schemaName, schema, schema);
        for (const tables of children(schema)) {
          for (const node of children(tables)) {
            const table = {
              node,
              schema: schemaName,
              name: attr(node).name,
              columns: new Map(),
              composites: new Map(),
              virtual: new Map(),
              indexes: [],
              constraints: [],
              relations: [],
            };
            this.add(this.tables, `${schemaName}.${table.name}`, table, node);
            for (const collection of children(node)) {
              for (const member of children(collection)) {
                const a = attr(member),
                  tag = member.nodeTag;
                if (tag === "column")
                  this.add(table.columns, a.name, member, member);
                else if (tag === "compositeColumn")
                  this.add(table.composites, a.name, member, member);
                else if (VIRTUAL.has(tag))
                  this.add(table.virtual, a.name, member, member);
                else if (tag === "index") table.indexes.push(member);
                else if (tag === "constraint") table.constraints.push(member);
                for (const relation of children(member)) {
                  if (relation.nodeTag === "relation")
                    table.relations.push({ owner: member, node: relation });
                }
              }
            }
          }
        }
      }
    }
  }

  add(map, key, value, node) {
    if (map.has(key)) fail(node, `duplicate declaration ${key}`);
    map.set(key, value);
  }

  checkMembers(table, node, columns, required = true) {
    if (required && !columns.length) fail(node, "columns must not be empty");
    if (new Set(columns).size !== columns.length)
      fail(node, "repeated columns");
    for (const name of columns) {
      if (!table.columns.has(name))
        fail(node, `unknown physical column ${name}`);
    }
  }

  target(node) {
    const parts = attr(node)
      .to.split(".")
      .map((x) => x.trim());
    const target = this.tables.get(parts.slice(0, 2).join("."));
    if (![2, 3].includes(parts.length) || !target)
      fail(node, `unknown relation target ${attr(node).to}`);
    const columns =
      parts.length === 2
        ? names(attr(target.node).pkey)
        : target.composites.has(parts[2])
          ? names(attr(target.composites.get(parts[2])).columns)
          : [parts[2]];
    this.checkMembers(target, node, columns);
    return { table: target, columns };
  }

  validateTable(table) {
    this.checkMembers(table, table.node, names(attr(table.node).pkey), false);
    const family = [
      ...table.columns.keys(),
      ...table.composites.keys(),
      ...table.virtual.keys(),
    ];
    if (new Set(family).size !== family.length)
      fail(table.node, "duplicate column-family name");
    for (const column of table.columns.values()) {
      const a = attr(column),
        dtype = a.dtype ?? (a.size ? "A" : "T");
      if (!contract.dtypeCodes.includes(dtype))
        fail(column, `unknown dtype ${dtype}`);
      if (dtype === "serial4" && (a.size || a.sqldefault))
        fail(column, "serial4 owns its size/default");
    }
    for (const composite of table.composites.values()) {
      this.checkMembers(table, composite, names(attr(composite).columns));
    }
    const indexes = new Set(),
      constraints = new Set(),
      relations = new Set();
    for (const index of table.indexes) {
      const a = attr(index),
        cols = names(a.columns);
      this.checkMembers(table, index, cols);
      if (
        typeof a.columns !== "string" &&
        (!a.columns ||
          Array.isArray(a.columns) ||
          typeof a.columns !== "object")
      ) {
        fail(index, "index columns must be a string or object");
      }
      if (!a.name && !a.x_auto_name)
        fail(index, "the internal projection requires an index identity");
      if (
        typeof a.columns === "object" &&
        Object.values(a.columns).some((v) => v !== null && v !== "DESC")
      ) {
        fail(index, "index ordering must be null or DESC");
      }
      if (indexes.has(membersKey(cols)))
        fail(index, "duplicate index column set");
      indexes.add(membersKey(cols));
    }
    for (const constraint of table.constraints) {
      const a = attr(constraint);
      if (a.constraint_type === "CHECK") {
        if (!a.check_clause) fail(constraint, "CHECK requires check_clause");
      } else {
        const cols = names(a.columns);
        this.checkMembers(table, constraint, cols);
        if (constraints.has(membersKey(cols)))
          fail(constraint, "duplicate UNIQUE column set");
        constraints.add(membersKey(cols));
      }
    }
    for (const { owner, node } of table.relations) {
      const a = attr(node);
      if (VIRTUAL.has(owner.nodeTag))
        fail(node, "physical foreign keys cannot belong to virtual columns");
      const local =
        owner.nodeTag === "compositeColumn"
          ? names(attr(owner).columns)
          : [attr(owner).name];
      this.checkMembers(table, node, local);
      if (relations.has(membersKey(local)))
        fail(node, "duplicate relation column set");
      relations.add(membersKey(local));
      const target = this.target(node);
      if (target.columns.length !== local.length)
        fail(node, "relation column counts differ");
      if (
        !a.foreign_key &&
        !a.x_weak &&
        [
          "on_delete",
          "on_update",
          "deferrable",
          "deferred",
          "initially_deferred",
        ].some((k) => a[k])
      )
        fail(node, "physical relation options require foreign_key");
      if (a.initially_deferred && !a.deferrable && !a.deferred)
        fail(node, "initially_deferred requires deferrable");
      for (const key of ["on_delete", "on_update"]) {
        if (
          a[key] &&
          ![
            "CASCADE",
            "SET NULL",
            "SET DEFAULT",
            "RESTRICT",
            "NO ACTION",
          ].includes(a[key])
        ) {
          fail(node, `unsupported ${key}: ${a[key]}`);
        }
      }
    }
  }

  renderTable(table) {
    const { schema, name } = table,
      a = attr(table.node),
      pkey = names(a.pkey);
    const result = entity("table", schema, name, name, {
      pkeys: pkey.length ? pkey.join(",") : null,
    });
    Object.assign(result, {
      columns: {},
      relations: {},
      constraints: {},
      indexes: {},
    });
    if (a.comment) result.attributes.comment = a.comment;
    for (const [columnName, node] of table.columns) {
      const attrs = attr(node);
      const values = Object.fromEntries(
        contract.columnKeys
          .filter((k) => attrs[k] != null)
          .map((k) => [k, attrs[k]]),
      );
      values.dtype ??= values.size ? "A" : "T";
      if (pkey.includes(columnName)) {
        values.notnull = "_auto_";
        if (pkey.length === 1) delete values.unique;
      }
      put(result.columns, columnName, {
        ...entity("column", schema, name, columnName, clean(values)),
        column_name: columnName,
      });
    }
    const autoIndexes = [],
      indexSpecs = new Map();
    for (const { owner, node } of table.relations) {
      const a = attr(node);
      if (a.x_weak && !a.foreign_key) continue;
      const cols =
        owner.nodeTag === "compositeColumn"
          ? names(attr(owner).columns)
          : [attr(owner).name];
      const target = this.target(node);
      if (a.indexed ?? true) autoIndexes.push(cols);
      if (!a.foreign_key) continue;
      const values = {
        related_schema: target.table.schema,
        related_table: target.table.name,
        related_columns: target.columns,
        constraint_type: "FOREIGN KEY",
      };
      for (const key of ["on_delete", "on_update"])
        if (a[key]) values[key] = a[key];
      if (a.deferrable || a.deferred) values.deferrable = true;
      if (a.initially_deferred || a.deferred) values.initially_deferred = true;
      const relation = relationItem(
        schema,
        name,
        cols,
        values,
        a.constraint_name,
      );
      put(result.relations, relation.entity_name, relation);
    }
    for (const node of table.constraints) {
      const a = attr(node);
      const item = constraintItem(
        schema,
        name,
        names(a.columns),
        a.constraint_type,
        a.x_auto_name ? null : a.name,
        a.check_clause,
      );
      put(result.constraints, item.entity_name, item);
    }
    for (const node of table.composites.values()) {
      const a = attr(node);
      if (!a.unique) continue;
      const item = constraintItem(schema, name, names(a.columns), "UNIQUE");
      if (!Object.hasOwn(result.constraints, item.entity_name))
        put(result.constraints, item.entity_name, item);
    }
    for (const node of table.indexes) {
      const a = attr(node),
        cols = names(a.columns);
      const values = {
        columns:
          typeof a.columns === "object"
            ? structuredClone(a.columns)
            : Object.fromEntries(cols.map((c) => [c, null])),
      };
      for (const key of contract.indexOptions)
        if (a[key]) values[key] = structuredClone(a[key]);
      const item = indexItem(
        schema,
        name,
        cols,
        values,
        a.x_auto_name ? null : a.name,
      );
      put(result.indexes, item.entity_name, item);
    }
    for (const [columnName, node] of table.columns) {
      const indexed = attr(node).indexed;
      if (
        !indexed ||
        (typeof indexed === "object" && !Object.keys(indexed).length)
      )
        continue;
      const spec = typeof indexed === "object" ? structuredClone(indexed) : {};
      for (const k of Object.keys(spec))
        if (
          !["unique", "method", "where", "tablespace", "sorting"].includes(k) &&
          !k.startsWith("with_")
        )
          fail(node, `unknown indexed option ${k}`);
      if (spec.unique && !spec.where) {
        if (!pkey.includes(columnName))
          result.columns[columnName].attributes.unique = true;
        continue;
      }
      const columns = { [columnName]: spec.sorting || null },
        with_options = Object.fromEntries(
          Object.entries(spec)
            .filter(([k]) => k.startsWith("with_"))
            .map(([k, v]) => [k.slice(5), v]),
        );
      const attributes = {
        columns,
        ...Object.fromEntries(
          Object.entries(spec).filter(
            ([k]) => !k.startsWith("with_") && k !== "sorting",
          ),
        ),
        ...(Object.keys(with_options).length ? { with_options } : {}),
      };
      if (
        typeof indexed === "object" &&
        !autoIndexes.some((cols) => same(cols, [columnName]))
      )
        indexSpecs.set(JSON.stringify([columnName]), attributes);
      autoIndexes.push([columnName]);
    }
    for (const cols of autoIndexes) {
      if (
        same(cols, pkey) ||
        (cols.length === 1 &&
          (pkey.includes(cols[0]) || result.columns[cols[0]].attributes.unique))
      )
        continue;
      const requested = indexSpecs.get(JSON.stringify(cols));
      const item = indexItem(
        schema,
        name,
        cols,
        requested || {
          columns: Object.fromEntries(cols.map((c) => [c, null])),
        },
      );
      const existing = result.indexes[item.entity_name];
      if (
        existing &&
        !requested &&
        (existing.attributes.where ||
          ![undefined, "btree"].includes(existing.attributes.method))
      ) {
        fail(
          table.node,
          "partial/non-btree index does not cover required full index",
        );
      }
      if (!existing) put(result.indexes, item.entity_name, item);
    }
    return result;
  }
}
