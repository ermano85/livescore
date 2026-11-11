// Zero-dependency static file server for local development.
//   npm start            -> http://localhost:5173
//   PORT=8080 npm start  -> another port
//   HOST=0.0.0.0 npm start -> also reachable from other devices on your network
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    let rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
    if (rel.split(/[/\\]/).some((part) => part.startsWith('.'))) throw new Error('hidden');
    let file = resolve(join(ROOT, rel));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) throw new Error('outside root');
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const [body, info] = await Promise.all([readFile(file), stat(file)]);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Last-Modified': info.mtime.toUTCString(),
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(PORT, HOST, () => {
  console.log(`Serving ${ROOT} at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});
