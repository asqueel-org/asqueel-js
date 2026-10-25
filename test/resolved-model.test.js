import test from "node:test";
import assert from "node:assert/strict";
import inputs from "./model-inputs.json" with { type: "json" };
import fixtures from "./fixtures/model-cases.json" with { type: "json" };
import { evaluateModel, applySteps } from "./model-cases.js";
import { sourceRows } from "./source-parity.js";
import { SqlBuilder, defineModel } from "../src/index.js";

// The composed source travels as TYTX; its rows are compared without attribute order.
const comparable = (result) =>
  result.source === undefined ? result : { ...result, source: sourceRows(result.source) };

for (const field of ["__ins_ts", "__mod_ts", "__del_ts"])
  for (const indexed of [undefined, false, true])
    for (const extraFirst of [false, true])
      test(`sysfield ${field}: indexed=${indexed}, extraFirst=${extraFirst}`, () => {
        let t;
        const b = defineModel((root) => {
          t = root.db("demo").packages().package("app").table("item");
          t.options().sysFields();
          if (extraFirst) t.column("name");
          t.column(field, indexed === undefined ? {} : { indexed });
        });
        const check = () => {
          const before = b.toSource();
          const expected = indexed ?? true;
          assert.equal(b.resolve().table("app.item").column(field).attributes.indexed, expected);
          const physical = b.toMigration().root.schemas.main.tables.app_item;
          assert.equal(Object.values(physical.indexes).some((i) => field in i.attributes.columns), expected);
          assert.deepEqual(b.toSource(), before);
        };
        check();
        if (!extraFirst) t.column("name");
        check();
      });
for (const [i, c] of inputs.entries())
  test(`Python composed source + migrate: ${c.name}`, () => {
    const diagnostics = {},
      actual = evaluateModel(c, diagnostics);
    assert.deepEqual(comparable(actual), comparable(fixtures[i].expected), JSON.stringify(diagnostics));
    // A source written by Python loads in JavaScript as the JavaScript source does.
    const expected = fixtures[i].expected;
    if (expected.migration && expected.modelAccepted) {
      const fromPython = SqlBuilder.fromTytx(expected.source);
      assert.deepEqual(sourceRows(fromPython.toTytx()), sourceRows(SqlBuilder.fromTytx(actual.source).toTytx()));
      assert.deepEqual(fromPython.toMigration(), expected.migration);
    }
  });
test("linked hierarchy preserves navigation and generated hooks", () => {
  const c = inputs.find((c) => c.name === "061/linked_cross_package"),
    b = new SqlBuilder();
  assert.ok(applySteps(b, c.layers[0]).every(Boolean));
  const m = b.resolve();
  const tree = m.table("app.item"),
    master = m.table("other.master");
  assert.equal(tree.column("@master_id.id"), master.column("id"));
  assert.equal(master.column("@root_item_id.id"), tree.column("id"));
  assert.equal(tree.attributes.hierarchical_linked_to, "other.master");
  assert.equal(tree.column("position").dtype, "L");
  assert.equal(
    master.column("root_item_id").attributes.onInserting,
    "insertLinkedHierarchicalRoot",
  );
  assert.deepEqual(m.toMigration(), b.toMigration());
});
test("resolved objects preserve identity, navigation and aliases", () => {
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
  assert.deepEqual(b.toSource(), before);
});
test("resolution is repeatable and leaves the source unchanged", () => {
  const b = defineModel((root) => {
    const t = root.db("offline").packages().package("app").table("item");
    t.options().sysFields();
    t.column({ name: "name", dtype: "T" });
  });
  const before = b.toSource(),
    m = b.resolve();
  assert.equal(m.table("app.item").virtual_columns.keys().length, 5);
  assert.equal(m.table("app.item").logicalDeletionField, "__del_ts");
  assert.deepEqual(b.resolve().toMigration(), m.toMigration());
  assert.deepEqual(b.toSource(), before);
});
test("attributes outside the grammar are refused", () => {
  for (const attributes of [{ name: "t", x_table_class: null }, { name: "t", x_expanded_legacy: true }])
    assert.throws(
      () => defineModel((r) => r.db("x").packages().package("app").table(attributes)),
      /unknown attribute/,
    );
});
test("inactive partition compiles, invalid active policy and unported hooks fail explicitly", () => {
  const policy = defineModel((r) =>
    r
      .db("x")
      .packages()
      .package("app")
      .table({ name: "item", partition_company_id: "company" })
      .column({ name: "id", dtype: "I" }),
  );
  assert.doesNotThrow(() => policy.queries().compile({ operation: "select", table: "app.item" }));
  assert.throws(() => policy.queries().compile({ operation: "select", table: "app.item",
    environment: {current_company: 'one'} }), /Unknown column/);
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
    /write behavior not implemented/,
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
