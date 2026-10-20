import test from "node:test";
import assert from "node:assert/strict";
import inputs from "./model-inputs.json" with { type: "json" };
import fixtures from "./fixtures/resolved-model.json" with { type: "json" };
import { evaluateModel, applySteps } from "./model-cases.js";
import { SqlBuilder, DbModel, defineModel } from "../src/index.js";
for (const [i, c] of inputs.entries())
  test(`Python 0.6.0 complete model + migrate: ${c.name}`, () => {
    const diagnostics = {},
      actual = evaluateModel(c, diagnostics);
    assert.deepEqual(actual, fixtures[i].expected, JSON.stringify(diagnostics));
    if (actual.model) {
      const restored = DbModel.fromJSON(JSON.stringify(actual.model));
      assert.deepEqual(restored.toJSON(), actual.model);
    }
  });
test("resolved objects preserve identity, navigation, aliases and owned JSON", () => {
  const c = inputs.find((c) => c.name === "060/alias_relation_inheritance"),
    b = new SqlBuilder();
  assert.ok(applySteps(b, c.layers[0]).every(Boolean));
  const before = b.toSource(),
    m = b.resolve(),
    t = m.table("app.item");
  assert.equal(m.tables.get("app.item"), t);
  assert.equal(m.package("app").table("item"), t);
  assert.equal(t.column("id").table, t);
  assert.equal(t.column("id").pkg, m.package("app"));
  assert.equal(t.column("@target_id.id"), m.column("app.target.id"));
  assert.equal(
    t.column("remote_value").originalColumn,
    m.column("app.target.id"),
  );
  assert.equal(t.column("target_copy").dtype, "I");
  assert.ok(t.relations.getNode("@target_copy").attributes.joiner);
  assert.equal(t.relations.getNode("@target_copy.id").attributes.dtype, "I");
  const json = m.toJSON();
  json.namespaces.children[0].attributes.name = "modified";
  assert.equal(m.package("app").attributes.name, "app");
  const restored = DbModel.fromJSON(m.toJSON());
  assert.equal(restored.column("app.item.remote_value").dtype, "I");
  assert.deepEqual(restored.toMigration(), b.toMigration());
  assert.deepEqual(b.toSource(), before);
});
test("resolution is repeatable and expanded options survive JSON round-trip", () => {
  const b = defineModel((root) => {
    const t = root.db("offline").packages().package("app").table("item");
    t.options().sys_fields();
    t.column({ name: "name", dtype: "T" });
  });
  const before = b.toSource(),
    m = b.resolve(),
    doc = m.toJSON();
  assert.equal(m.table("app.item").virtual_columns.keys().length, 5);
  assert.equal(m.table("app.item").logicalDeletionField, "__del_ts");
  assert.deepEqual(b.toJSON(), doc);
  assert.deepEqual(DbModel.fromJSON(doc).toMigration(), b.toMigration());
  assert.deepEqual(b.toSource(), before);
});
test("unsupported JSON version and executable class declarations are refused", () => {
  assert.throws(
    () => DbModel.fromJSON({ version: 99 }),
    /Unsupported model JSON/,
  );
  assert.throws(
    () =>
      defineModel((r) =>
        r
          .db("x")
          .packages()
          .package("app")
          .table({ name: "t", x_table_class: null }),
      ).resolve(),
    /x_table_class/,
  );
});

test("new model policies and hooks remain blocked in the old query runtime", () => {
  const policy = defineModel((r) =>
    r
      .db("x")
      .packages()
      .package("app")
      .table({ name: "item", partition_company_id: "company" })
      .column({ name: "id", dtype: "I" }),
  );
  assert.throws(
    () => policy.queries().compile({ operation: "select", table: "app.item" }),
    /policy.*fuori perimetro/,
  );
  const hook = defineModel((r) =>
    r
      .db("x")
      .packages()
      .package("app")
      .table("item")
      .column({ name: "id", dtype: "I", onInserting: "symbolicHook" }),
  );
  assert.throws(
    () =>
      hook
        .queries()
        .compile({ operation: "insert", table: "app.item", values: { id: 1 } }),
    /scrittura non implementato/,
  );
  assert.throws(
    () =>
      defineModel((r) =>
        r.db("x").packages().package({ name: "app", path: "python-package" }),
      ).resolve(),
    /filesystem loader/,
  );
});

test("typed Data Bag bindings resolve on an owned model and survive cloning", () => {
  const b = defineModel((r) =>
    r
      .db("x")
      .packages()
      .package("app")
      .table("item")
      .column({ name: "name", dtype: "^dtype", name_long: "^caption" }),
  );
  b.data.setItem("dtype", "T");
  b.data.setItem("caption", "Name");
  const before = b.toSource(),
    clone = b.clone();
  clone.data.setItem("caption", "Clone");
  assert.equal(b.resolve().column("app.item.name").name_long, "Name");
  assert.equal(clone.resolve().column("app.item.name").name_long, "Clone");
  assert.deepEqual(b.toSource(), before);
});
