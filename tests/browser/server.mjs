import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const traxRoot = resolve(process.env.TRAX_ROOT ?? resolve(root, '../Trax'));
const routes = new Map([
    ['/', ['tests/browser/fixture.html', 'text/html']],
    ['/fixture/harness.js', ['tests/browser/harness.js', 'text/javascript']],
    ['/fixture/checkpoint-adapter.js', ['tests/browser/checkpoint-adapter.js', 'text/javascript']],
    ['/modules/trix.js', ['modules/trix.js', 'text/javascript']],
    ['/modules/checkpoint.js', ['modules/checkpoint.js', 'text/javascript']],
    ['/vendor/trax.js', [resolve(traxRoot, 'modules/trax.js'), 'text/javascript']]
]);

const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    const route = routes.get(path);
    if (!route || request.method !== 'GET') {
        response.writeHead(404).end('Not found');
        return;
    }
    try {
        let content = await readFile(resolve(root, route[0]), 'utf8');
        if (path === '/modules/trix.js') {
            const remote = 'https://0x1f528.github.io/Trax/modules/trax.js';
            if (!content.includes(remote)) {
                throw new Error('Trix import changed: update the test server import mapping.');
            }
            content = content.replace(remote, '/vendor/trax.js');
        }
        response.writeHead(200, { 'Content-Type': route[1] + '; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(content);
    } catch (error) {
        console.error(error);
        response.writeHead(500).end(String(error));
    }
});
server.listen(4179, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
