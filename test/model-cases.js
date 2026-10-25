import { SqlBuilder, SqlDatabaseConfig, composeModels } from "../src/index.js";
export function applySteps(builder, steps) {
  return steps.map((s) => {
    try {
      builder.contribution(s.contribution || "main", (root) =>
        (s.parent ? builder.node(s.parent) : root)[s.tag](
          structuredClone(s.attributes),
        ),
      );
      return true;
    } catch {
      return false;
    }
  });
}
export function evaluateModel(caseData, diagnostics = {}) {
  const layers = [],
    outcomes = [];
  for (const steps of caseData.layers) {
    const b = new (caseData.configuration ? SqlDatabaseConfig : SqlBuilder)();
    for (const [key, value] of Object.entries(caseData.data || {}))
      b.data.setItem(key, structuredClone(value));
    outcomes.push(applySteps(b, steps));
    layers.push(b);
  }
  const result = { outcomes };
  let b;
  try {
    // As Python compose_recipe, every mode composes (and validates) the recipe.
    if (caseData.mode === "clone") {
      b = layers[0].clone();
      outcomes.push(applySteps(b, caseData.after));
      b = composeModels(b);
    } else if (["layers", "recompose"].includes(caseData.mode)) {
      b = composeModels(...layers);
      if (caseData.mode === "recompose") b = composeModels(layers[0], b);
    } else b = composeModels(layers[0]);
    result.compositionAccepted = true;
  } catch (e) {
    result.compositionAccepted = false;
    diagnostics.composition = e.message;
    return result;
  }
  result.source = b.toTytx();
  for (const [key, render] of [
    ["model", () => b.resolve() && true],
    ["migration", () => b.toMigration()],
  ]) {
    try {
      const value = render();
      if (key === "migration") result[key] = value;
      else result.modelAccepted = true;
    } catch (e) {
      result[key + "Accepted"] = false;
      diagnostics[key] = e.message;
    }
  }
  return result;
}
