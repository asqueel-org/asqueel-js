import inputs from '../test/model-inputs.json' with {type:'json'};
import {evaluateModel} from '../test/model-cases.js';
console.log(JSON.stringify(inputs.map(c=>({name:c.name,result:evaluateModel(c)}))));
