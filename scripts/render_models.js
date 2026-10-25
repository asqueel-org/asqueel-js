import inputs from "../test/model-inputs.json" with { type: "json" };
import { evaluateModel } from "../test/model-cases.js";
import { defineModel } from "../src/index.js";
import { shop } from "../examples/shop.js";
import { application } from "../examples/application.js";
import { groupedItems } from "../examples/groups.js";
import { virtualRelations } from "../examples/virtual-relations.js";
import { browserQueries } from "../examples/browser-queries.js";
console.log(
  JSON.stringify({
    cases: inputs.map((c) => evaluateModel(c)),
    examples: Object.fromEntries(
      Object.entries({
        shop,
        application,
        groups: groupedItems,
        "virtual-relations": virtualRelations,
        queries: browserQueries,
      }).map(([name, populate]) => {
        const b = defineModel(populate);
        return [name, { source: b.toTytx(), migration: b.toMigration() }];
      }),
    ),
  }),
);
