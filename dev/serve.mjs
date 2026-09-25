import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PREFIX = '/shelfy-site/';
const PORT = Number(process.env.PORT || 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.xml', '.txt', '.md']);

async function resolveFile(pathname) {
  if (!pathname.startsWith(PREFIX)) return null;
  let relative = decodeURIComponent(pathname.slice(PREFIX.length));
  if (relative === '' || relative.endsWith('/')) relative += 'index.html';
  const absolute = normalize(join(ROOT, relative));
  if (!absolute.startsWith(ROOT + sep)) return null;
  if (absolute.split(sep).some((part) => part.startsWith('.') && part !== '.nojekyll')) return null;
  try {
    const info = await stat(absolute);
    if (info.isDirectory()) return resolveFile(pathname.replace(/\/?$/, '/'));
    return absolute;
  } catch {
    return null;
  }
}

async function send(request, response, file, status) {
  const body = await readFile(file);
  const extension = extname(file);
  const etag = '"' + createHash('sha1').update(body).digest('hex').slice(0, 16) + '"';
  const headers = {
    'content-type': TYPES[extension] || 'application/octet-stream',
    'cache-control': 'max-age=600',
    etag,
    vary: 'Accept-Encoding'
  };
  if (status === 200 && request.headers['if-none-match'] === etag) {
    response.writeHead(304, headers);
    response.end();
    return;
  }
  let payload = body;
  if (COMPRESSIBLE.has(extension) && /\bgzip\b/.test(request.headers['accept-encoding'] || '')) {
    payload = gzipSync(body, { level: 9 });
    headers['content-encoding'] = 'gzip';
  }
  headers['content-length'] = payload.length;
  response.writeHead(status, headers);
  response.end(request.method === 'HEAD' ? undefined : payload);
}

const server = createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, 'http://localhost');
    if (pathname === '/shelfy-site') {
      response.writeHead(301, { location: PREFIX });
      response.end();
      return;
    }
    const file = await resolveFile(pathname);
    if (file) {
      await send(request, response, file, 200);
      return;
    }
    await send(request, response, join(ROOT, '404.html'), 404);
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(String(error));
  }
});

server.listen(PORT, () => {
  console.log('shelfy local: http://localhost:' + PORT + PREFIX);
});
