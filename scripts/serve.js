import {createServer} from 'node:http';
import {readFile, realpath} from 'node:fs/promises';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../browser/', import.meta.url));
const port = Number(process.env.PORT || 8092);
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json'};
const server = createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405, {Allow: 'GET, HEAD'}).end(); return;
    }
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const path = await realpath(resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname)));
        if (!path.startsWith(resolve(root) + sep)) {
            response.writeHead(403).end(); return;
        }
        const body = await readFile(path);
        response.writeHead(200, {'Content-Type': types[extname(path)] || 'application/octet-stream',
            'Cache-Control': 'no-store', 'Content-Length': body.length});
        response.end(request.method === 'HEAD' ? undefined : body);
    } catch { response.writeHead(404).end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Asqueel JS: http://127.0.0.1:${port}`));
