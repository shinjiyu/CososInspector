import http from 'http';
import { createReadStream, existsSync } from 'fs';
import { extname, resolve } from 'path';
import { getShareDir, ensureShareDirs } from './shared-fs.mjs';

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.txt': 'text/plain',
};

/** @type {http.Server | null} */
let server = null;
let listeningPort = 0;

export function isShareHttpRunning() {
  return !!server?.listening;
}

export function getShareHttpListeningPort() {
  return listeningPort;
}

export function startShareHttp(port) {
  if (server?.listening) return Promise.resolve(listeningPort);

  ensureShareDirs();
  const root = getShareDir();

  return new Promise((resolve, reject) => {
    const s = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://127.0.0.1`);
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405);
          res.end();
          return;
        }
        const rel = decodeURIComponent(url.pathname.replace(/^\//, ''));
        if (!rel || rel.includes('..')) {
          res.writeHead(403);
          res.end();
          return;
        }
        const abs = joinSafe(root, rel);
        if (!existsSync(abs)) {
          res.writeHead(404);
          res.end();
          return;
        }
        const mime = MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': mime,
          'Access-Control-Allow-Origin': '*',
        });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        createReadStream(abs).pipe(res);
      } catch {
        res.writeHead(500);
        res.end();
      }
    });

    s.on('error', reject);
    s.listen(port, '127.0.0.1', () => {
      server = s;
      listeningPort = port;
      resolve(port);
    });
  });
}

function joinSafe(root, rel) {
  const abs = resolve(root, rel);
  if (!abs.startsWith(root)) throw new Error('path escape');
  return abs;
}
