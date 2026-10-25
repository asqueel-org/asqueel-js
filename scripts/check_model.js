import {readFileSync,writeFileSync} from 'node:fs';
import {evaluateModel} from '../test/model-cases.js';
import {sourceRows} from '../src/source-bag.js';
const inputs=JSON.parse(readFileSync('test/model-inputs.json')),fixtures=JSON.parse(readFileSync('test/fixtures/model-cases.json'));
// The composed source is compared as TYTX rows, without attribute order.
const comparable=r=>r.source===undefined?r:{...r,source:sourceRows(r.source)};
export function differences(a,b,path='',limit=6,out=[]){
    if(out.length>=limit||Object.is(a,b))return out;
    if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
        for(const k of new Set([...Object.keys(a),...Object.keys(b)]))differences(a[k],b[k],path+'.'+k,limit,out);
    }else out.push({path,js:a,python:b});return out;
}
const failures=[];
for(const [i,c]of inputs.entries()){
    const diagnostics={},actual=comparable(evaluateModel(c,diagnostics)),expected=comparable(fixtures[i].expected),diff=differences(actual,expected);
    if(diff.length)failures.push({name:c.name,diagnostics,diff});
}
writeFileSync('/tmp/asqueel-model-diffs.json',JSON.stringify(failures,null,2));
console.log(`${inputs.length-failures.length}/${inputs.length} match; failures: ${failures.map(f=>f.name).join(', ')}`);
console.log(JSON.stringify(failures.slice(0,3),null,2));process.exitCode=failures.length?1:0;
