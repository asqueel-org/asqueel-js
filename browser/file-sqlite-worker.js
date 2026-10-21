import wasmBinary from 'embedded-sqlite-wasm';
import {openBrowserSQLite} from '../src/adapters/browser-sqlite.js';
import {workspaceRequest} from './offline-workspace.js';
let queue = Promise.resolve();
self.onmessage = ({data:{id, type, desired, workspaceName}}) => {
    queue = queue.then(async () => {
        try {
            const result = await workspaceRequest(type, desired, {
                workspaceName, openSQLite:name => openBrowserSQLite(name, {wasmBinary}),
            });
            self.postMessage({id, result});
        } catch (error) { self.postMessage({id, error:error.message}); }
    });
};
