import { CompositionBuilder } from "./composition.js";
import grammar from "./generated/grammar.json" with { type: "json" };
import configurationGrammar from "./generated/configuration-grammar.json" with { type: "json" };
import { resolveModel, migrationForBuilder } from "./model.js";
import { SqliteQueries } from "./queries.js";
export {
  resolveModel,
  DbModel,
  ModelNode,
  modelToJSON,
  modelFromJSON,
} from "./model.js";
/** Public declarations follow the pinned Python 0.6.0 grammar. */
export class SqlBuilder extends CompositionBuilder {
  static _name = "sql";
  static portableModel = true;
  static {
    const portable = structuredClone(grammar);
    // Python class objects have no portable JSON representation.
    portable.elements.table.attributes.parameters.find(
      (p) => p.name === "x_table_class",
    ).annotation = { kind: "type", module: "builtins", name: "object" };
    this.defineGrammar(portable);
  }
  validateModel() {
    this.resolve();
    return this;
  }
  resolve() {
    return resolveModel(this);
  }
  toJSON() {
    return this.resolve().toJSON();
  }
  toMigration() {
    return migrationForBuilder(this);
  }
  queries(adapter = null) {
    return new SqliteQueries(this, adapter);
  }
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
