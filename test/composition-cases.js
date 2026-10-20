import {SqlBuilder, composeModels} from '../src/index.js';
import {equal} from '../src/sqlite.js';
import {projectApplication} from '../src/application.js';

function modelDocument(builder, inspectRelations) {
    const {tables} = projectApplication(builder, SqlBuilder, {withModel: true});
    const keys = new Set(['name', 'size', 'group', 'name_long', 'name_short', 'comment', 'sql_formula',
        'x_legacy__addClass', 'x_requires_compilation']);
    return Object.fromEntries([...tables].map(([key, table]) => [key, {
        declarations: table.declarations,
        attributes: Object.fromEntries(Object.entries(table.a).filter(([k]) => k === 'group_subtables')),
        ...(inspectRelations ? {relations: Object.fromEntries(table.relations)} : {}),
        columns: Object.fromEntries([...table.columns, ...table.virtual].map(([name, c]) => [name, {
            kind: c.tag, dtype: c.a.dtype || (c.a.size ? 'A' : 'T'),
            attributes: Object.fromEntries(Object.entries(c.a).filter(([k]) => keys.has(k) || k.startsWith('var_'))),
            ...(inspectRelations ? {alias_target: c.alias_target || null} : {}),
        }])),
    }]));
}

const check = (condition, message) => { if (!condition) throw new Error(message); };
function apply(model, steps) {
    const outcomes = [];
    for (const step of steps) {
        const before = model.toSource();
        let rejected = false;
        try {
            model.contribution(step.contribution, root => {
                const parent = step.parent ? model.node(step.parent) : root;
                parent[step.tag](structuredClone(step.attributes));
            });
        } catch (error) {
            if (!step.reject) throw new Error(`Unexpected rejection: ${step.parent}.${step.tag}: ${error.message}`, {cause: error});
            rejected = true;
            check(equal(model.toSource(), before), 'Rejected declaration changed the model');
        }
        check(rejected === step.reject, `Unexpected acceptance: ${step.tag}`);
        outcomes.push(!rejected);
    }
    return outcomes;
}

/** Same authored calls as Python, never replaying the expected resulting tree. */
export function evaluateComposition(entry) {
    const layers = [], outcomes = [];
    for (const steps of entry.layers) {
        const model = new SqlBuilder();
        outcomes.push(apply(model, steps));
        layers.push(model);
    }
    const snapshots = layers.map(m => m.toSource());
    let result;
    try {
        if (entry.mode === 'clone') {
            result = layers[0].clone();
            outcomes.push(apply(result, entry.after));
        } else if (['layers', 'recompose'].includes(entry.mode)) {
            result = composeModels(...layers);
            if (entry.mode === 'recompose') result = composeModels(layers[0], result);
        } else result = layers[0];
    } catch (error) {
        if (!entry.rejectComposition) throw error;
        check(equal(snapshots, layers.map(m => m.toSource())), 'Failed composition changed input models');
        return {outcomes, compositionAccepted: false, inputsUnchanged: true};
    }
    check(!entry.rejectComposition, 'Composition should fail');
    result.validateSource();
    const answer = {outcomes, source: result.toSource()};
    if (entry.mode !== 'inline') {
        answer.inputsUnchanged = equal(snapshots, layers.map(m => m.toSource()));
        check(answer.inputsUnchanged, 'Composition changed input models');
    }
    for (const [key, render] of [['migration', () => result.toMigration()], ['model', () => modelDocument(result, entry.inspectRelations)]]) {
        if (!(key === 'migration' ? entry.render !== false : entry.inspectModel)) continue;
        let value, rejected = false;
        try { value = render(); } catch (error) {
            if (!entry.rejectResolution) throw error;
            rejected = true;
        }
        check(rejected === !!entry.rejectResolution, `${key}: unexpected resolution acceptance`);
        if (rejected) answer[key + 'Accepted'] = false;
        else answer[key] = value;
    }
    check(equal(answer.source, result.toSource()), 'Rendering changed source');
    return answer;
}
