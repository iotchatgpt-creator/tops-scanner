/**
 * Minimal static server for Heroku: binds 0.0.0.0:PORT and serves ./dist (SPA fallback).
 * Avoids shell PORT expansion / CLI quirks from `serve` on some dynos.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, 'dist');
const PORT = Number.parseInt(process.env.PORT || '3000', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0] || '/');
  const rel = decoded.startsWith('/') ? decoded.slice(1) : decoded;
  const resolved = path.resolve(DIST, rel);
  if (!resolved.startsWith(DIST)) return null;
  return resolved;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error(`[server] Missing dist build: ${path.join(DIST, 'index.html')} not found. Run npm run build (heroku-postbuild).`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed');
    return;
  }

  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  const filePath = safePath(pathname);
  if (!filePath) {
    send(res, 403, 'Forbidden');
    return;
  }

  const tryFile = (fp, fallbackIndex) => {
    fs.stat(fp, (err, st) => {
      if (!err && st.isFile()) {
        const ext = path.extname(fp).toLowerCase();
        const type = MIME[ext] || 'application/octet-stream';
        if (req.method === 'HEAD') {
          res.writeHead(200, { 'Content-Type': type });
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': type });
        fs.createReadStream(fp).pipe(res);
        return;
      }
      if (fallbackIndex) {
        const indexPath = path.join(DIST, 'index.html');
        fs.stat(indexPath, (e2, st2) => {
          if (e2 || !st2.isFile()) {
            send(res, 500, 'index.html missing');
            return;
          }
          if (req.method === 'HEAD') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end();
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          fs.createReadStream(indexPath).pipe(res);
        });
        return;
      }
      send(res, 404, 'Not Found');
    });
  };

  tryFile(filePath, true);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Listening on http://0.0.0.0:${PORT} serving ${DIST}`);
});

server.on('error', (err) => {
  console.error('[server] Failed to bind:', err);
  process.exit(1);
});
