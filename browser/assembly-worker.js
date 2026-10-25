import wasmBinary from 'embedded-sqlite-wasm';
import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {workspaceRequest} from './offline-workspace.js';
import {transferSnapshot} from '../test/transfer-runner.js';
import {upgradeAssembly} from './assembly-upgrade.js';
import {Assembly} from './assembly-domain.js';
let queue=Promise.resolve();
self.onmessage=({data:{id,type,desired,workspaceName}})=>{
    queue=queue.then(async()=>{
        try {
            const result=await workspaceRequest(type,desired,{
                workspaceName,upgrade:upgradeAssembly,openSQLite:name=>openBrowserSQLite(name,{wasmBinary}),
                inspect:async(db,builder)=>({...await transferSnapshot(db,builder),view:await new Assembly(builder,db).view()}),
                action:async(db,builder,desired)=>{
                    const app=new Assembly(builder,db);await app.action(desired.action);
                    return {trace:app.trace};
                },
            });
            self.postMessage({id,result});
        } catch(error){self.postMessage({id,error:error.message});}
    });
};
