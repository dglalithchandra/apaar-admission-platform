import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const host = process.env['PORTAL_HOST'] ?? '0.0.0.0';
const port = Number(process.env['PORTAL_PORT'] ?? '4173');
const root = resolve(process.env['PORTAL_DIRECTORY'] ?? 'apps/institution-portal/dist');
const gateway = process.env['GATEWAY_ORIGIN'] ?? 'http://gateway:8080';
const maximumProxyBytes = 6 * 1024 * 1024;

const media: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

async function proxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += value.length;
    if (size > maximumProxyBytes) {
      res.writeHead(413, { 'content-type': 'application/problem+json' });
      res.end(JSON.stringify({ detail: 'The proxied request is too large.' }));
      return;
    }
    chunks.push(value);
  }
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined && !['connection', 'host', 'content-length'].includes(key)) {
      headers.set(key, Array.isArray(value) ? value.join(',') : value);
    }
  }
  const body = Buffer.concat(chunks);
  const upstream = await fetch(`${gateway}${req.url ?? '/'}`, {
    ...(body.length === 0 ? {} : { body }),
    headers,
    method: req.method ?? 'GET',
  });
  const responseHeaders: Record<string, string> = {};
  upstream.headers.forEach((value, key) => {
    if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key)) {
      responseHeaders[key] = value;
    }
  });
  const payload = Buffer.from(await upstream.arrayBuffer());
  responseHeaders['content-length'] = String(payload.length);
  res.writeHead(upstream.status, responseHeaders);
  res.end(payload);
}

const server = createServer((req, res): void => {
  void (async (): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/ready' || url.pathname.startsWith('/v1/')) {
      await proxy(req, res);
      return;
    }
    const requested =
      url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const candidate = resolve(root, requested);
    const safe = candidate === root || candidate.startsWith(`${root}${sep}`);
    let target = safe ? candidate : resolve(root, 'index.html');
    try {
      if (!(await stat(target)).isFile()) target = resolve(root, 'index.html');
    } catch {
      target = resolve(root, 'index.html');
    }
    try {
      const content = await readFile(target);
      res.writeHead(200, {
        'cache-control': target.endsWith('index.html')
          ? 'no-store'
          : 'public, max-age=31536000, immutable',
        'content-length': String(content.length),
        'content-security-policy':
          "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
        'content-type': media[extname(target)] ?? 'application/octet-stream',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
      });
      res.end(content);
    } catch {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('The portal build is unavailable.');
    }
  })().catch(() => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('The local reference gateway is unavailable.');
  });
});

server.listen(port, host, () => {
  process.stdout.write(`institution-portal listening on ${host}:${String(port)}\n`);
});

async function shutdown(): Promise<void> {
  await new Promise<void>((resolveShutdown, reject) => {
    server.close((error) => {
      if (error === undefined) resolveShutdown();
      else reject(error);
    });
  });
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
