#!/usr/bin/env node
/**
 * Bhūsmṛti local server.
 * - serves the built app from dist/
 * - serves the *live* snapshot from public/data/ (so refreshes are instant)
 * - refreshes the snapshot on boot (if stale) and every 6 hours
 * - POST /api/refresh triggers a refresh
 */
import http from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const DATA = join(ROOT, 'public', 'data');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const REFRESH_AFTER_MS = Number(process.env.Bhūsmṛti_REFRESH_HOURS || 6) * 3600_000;
const PY = process.env.Bhūsmṛti_PYTHON || '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.bin': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
};

const refreshState = { running: false, startedAt: null, endedAt: null, exitCode: null, error: null };

function snapshotAgeMs() {
  const m = join(DATA, 'manifest.json');
  if (!existsSync(m)) return Infinity;
  return Date.now() - statSync(m).mtimeMs;
}

function manifestBuild() {
  try { return JSON.parse(readFileSync(join(DATA, 'manifest.json'), 'utf8')).build_id ?? null; } catch { return null; }
}

function refresh(reason) {
  if (refreshState.running) return { started: false, running: true };
  refreshState.running = true;
  refreshState.startedAt = new Date().toISOString();
  refreshState.error = null;
  console.log(`[bhusmriti] refresh (${reason}) started ${refreshState.startedAt}`);
  const child = spawn('bash', [join(ROOT, 'scripts', 'refresh.sh')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...(PY ? { Bhūsmṛti_PYTHON: PY } : {}) },
  });
  child.on('error', (e) => {
    refreshState.running = false;
    refreshState.endedAt = new Date().toISOString();
    refreshState.error = String(e);
    console.error('[bhusmriti] refresh failed to start', e);
  });
  child.on('exit', (code) => {
    refreshState.running = false;
    refreshState.endedAt = new Date().toISOString();
    refreshState.exitCode = code;
    console.log(`[bhusmriti] refresh finished code=${code} build=${manifestBuild()}`);
  });
  return { started: true, running: true };
}

function sendJson(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(s);
}

function safeFile(base, rel) {
  const p = resolve(base, rel);
  const root = resolve(base) + sep;
  if (p !== resolve(base) && !p.startsWith(root)) return null;
  return p;
}

function serveFile(req, res, file, cache) {
  if (!existsSync(file) || !statSync(file).isFile()) return false;
  const stat = statSync(file);
  const ext = extname(file).toLowerCase();
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': cache,
    'access-control-allow-origin': '*',
  });
  createReadStream(file).pipe(res);
  return true;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const path = decodeURIComponent(url.pathname);

  if (path === '/api/status') {
    return sendJson(res, 200, {
      ...refreshState,
      age_ms: snapshotAgeMs(),
      build: manifestBuild(),
      refresh_after_ms: REFRESH_AFTER_MS,
    });
  }
  if (path === '/api/refresh') {
    if (req.method !== 'POST' && req.method !== 'GET') return sendJson(res, 405, { error: 'POST only' });
    const out = refresh('manual');
    return sendJson(res, 202, out);
  }

  // live snapshot, not the stale copy inside dist/
  if (path.startsWith('/data/')) {
    const f = safeFile(DATA, path.slice('/data/'.length));
    if (f && serveFile(req, res, f, path.endsWith('manifest.json') ? 'no-store' : 'public, max-age=3600')) return;
    return sendJson(res, 404, { error: 'not found' });
  }

  if (!existsSync(DIST)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bhūsmṛti is not built yet. Run: npm run build\n');
    return;
  }

  if (path === '/' || path === '') return void serveFile(req, res, join(DIST, 'index.html'), 'no-store');
  const f = safeFile(DIST, path.replace(/^\//, ''));
  const cache = /\.[0-9a-f]{8,}\.(js|css)$/.test(path) ? 'public, max-age=31536000, immutable' : 'no-store';
  if (f && serveFile(req, res, f, cache)) return;
  // SPA fallback
  serveFile(req, res, join(DIST, 'index.html'), 'no-store');
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Bhūsmṛti  →  http://${HOST}:${PORT}\n`);
  const age = snapshotAgeMs();
  console.log(`[bhusmriti] snapshot age ${Number.isFinite(age) ? (age / 3600000).toFixed(1) + 'h' : 'missing'}`);
  if (age > REFRESH_AFTER_MS) refresh('stale at boot');
  else console.log('[bhusmriti] snapshot is fresh; auto-refresh every 6h');
});

setInterval(() => {
  if (!refreshState.running && snapshotAgeMs() > REFRESH_AFTER_MS) refresh('scheduled');
}, 30 * 60_000).unref();
