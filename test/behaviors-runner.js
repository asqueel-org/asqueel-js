import {defineModel} from '../src/index.js';
import {hierarchies, hierarchyHandlers, behaviorTables} from '../examples/hierarchies.js';
import {runHookCase} from './hooks-runner.js';
export const behaviorsModel = defineModel(hierarchies);
export const runBehaviorCase = (adapter, input) => runHookCase(adapter, input,
    {model: behaviorsModel, handlers: hierarchyHandlers, tables: behaviorTables});
