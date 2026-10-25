import { CompositionBuilder } from "./composition.js";
import grammar from "./generated/grammar.json" with { type: "json" };
import configurationGrammar from "./generated/configuration-grammar.json" with { type: "json" };
import { resolveModel, migrationForBuilder } from "./model.js";
import { SqliteQueries } from "./queries.js";
import { sourceBagToTytx } from "@genrojs/builders";
import { fromTytx as decodeTytx } from "@genrojs/tytx";
import { SqlSourceBag } from "./source-bag.js";
export { SqlSourceBag } from "./source-bag.js";
export {RecordNotFoundError, RecordMultipleRowsError, TransactionStateError, UnsupportedFeatureError} from './query-errors.js';
export { resolveModel, DbModel, ModelNode } from "./model.js";
/** Public declarations follow the pinned Python grammar. */
export class SqlBuilder extends CompositionBuilder {
  static _name = "sql";
  static portableModel = true;
  static {
    this.defineGrammar(grammar);
  }
  validateModel() {
    this.resolve();
    return this;
  }
  resolve() {
    return resolveModel(this);
  }
  toMigration(options = {}) {
    return migrationForBuilder(this, options);
  }
  queries(adapter = null, runtime = {}) {
    return new SqliteQueries(this, adapter, null, runtime);
  }
  /** The recipe source in TYTX, as Python ``recipe.source.to_tytx()`` writes it. */
  toTytx() {
    return sourceBagToTytx(this.source);
  }
  /** A recipe rebuilt from a saved source: its db node is replayed, so the grammar validates it. */
  static fromTytx(text) {
    const source = decodeTytx(text);
    if (!(source instanceof SqlSourceBag)) throw new TypeError("TYTX payload did not decode to SqlSourceBag");
    const nodes = source.getNodes().filter((n) => n.nodeTag === "db");
    if (nodes.length !== 1)
      throw new Error(`a saved source holds exactly one db node, found ${nodes.length}`);
    const recipe = new SqlDatabaseConfig();
    replayNode(nodes[0], recipe.root);
    return recipe;
  }
}

/** Call the element of ``node`` on ``target`` with its attributes, then its children. */
function replayNode(node, target) {
  const attributes = Object.fromEntries(
    Object.entries(node.getAttr()).filter(([k]) => k !== "_meta"),
  );
  const value = node.getValue(true);
  if (value != null && !(value instanceof SqlSourceBag))
    throw new TypeError(`${node.nodeTag}: only attributes and children can be replayed`);
  const child = target[node.nodeTag](attributes);
  if (node.nodeTag === "options")
    for (const name of node.getAttr("_meta")?.option_resets || []) child.reset({ name });
  if (value) for (const subnode of value.getNodes()) replayNode(subnode, child);
}
export function defineModel(populate) {
  const b = new SqlBuilder();
  populate(b.root, b);
  return b;
}
export function composeModels(...models) {
  return SqlBuilder.compose(...models);
}
export class SqlMigrationRenderer {
  constructor(builder) {
    this.builder = builder;
  }
  render() {
    return this.builder.toMigration();
  }
}

/** Connection declarations are configuration data; resolving never opens a connection. */
export class SqlDatabaseConfig extends SqlBuilder {
  static {
    const portable = structuredClone(configurationGrammar);
    const annotation = (a) => {
      if (!a) return a;
      if (a.kind === "union")
        return {
          ...a,
          items: a.items
            .filter((i) => i.name !== "BagResolver")
            .map(annotation),
        };
      if (a.module === "builtins" && a.name === "type")
        return { ...a, name: "object" };
      return a;
    };
    for (const spec of Object.values(portable.elements))
      for (const p of spec.attributes.parameters)
        p.annotation = annotation(p.annotation);
    this.defineGrammar(portable);
  }
}
