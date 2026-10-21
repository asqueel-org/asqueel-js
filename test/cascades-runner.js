import {defineModel} from '../src/index.js';
import {updateCascades, cascadeHandlers, cascadeTables} from '../examples/update-cascades.js';
import {runHookCase} from './hooks-runner.js';
export const cascadesModel = defineModel(updateCascades);
export const runCascadeCase = (adapter, input) => runHookCase(adapter, input,
    {model: cascadesModel, handlers: cascadeHandlers, tables: cascadeTables});
