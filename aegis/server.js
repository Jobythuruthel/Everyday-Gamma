// AEGIS kiosk server. Zero dependencies: Node 22.5+ only.
// Runs fully offline on the kiosk machine. Open http://localhost:1190
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { createEngine } from './engine.js';

const ROOT = fileURLToPath(new URL('./public/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json' };

export function createApp({ engine, adminPin }) {
  const streams = new Set();
  const pushBoard = () => {
    const msg = `data: ${JSON.stringify(engine.leaderboard())}\n\n`;
    for (const res of streams) res.write(msg);
  };

  const pinOk = req => {
    const got = Buffer.from(String(req.headers['x-admin-pin'] ?? ''));
    const want = Buffer.from(String(adminPin));
    return adminPin && got.length === want.length && timingSafeEqual(got, want);
  };

  async function body(req) {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 20_000) throw Object.assign(new Error('too_large'), { status: 413, code: 'too_large' });
    }
    try { return raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error('bad_json'), { status: 400, code: 'bad_json' }); }
  }

  const routes = {
    'GET /api/health': () => ({ ok: true }),
    'POST /api/visitors': async req => engine.registerVisitor(await body(req)),
    'POST /api/rounds': async req => { const b = await body(req); return engine.startRound(b.visitorId, b.module); },
    'POST /api/submit': async req => {
      const b = await body(req);
      const out = engine.submit(b.roundId, b);
      pushBoard();
      return out;
    },
    'GET /api/progress': (req, url) => engine.best(engine.getVisitor(url.searchParams.get('visitorId')).id),
    'GET /api/board': () => engine.leaderboard(),
    'GET /api/certificate': (req, url) => engine.certificate(url.searchParams.get('visitorId')),
    'GET /api/admin/stats': req => admin(req, () => engine.stats()),
    'POST /api/admin/delete': async req => admin(req, async () => { const r = engine.deleteVisitor((await body(req)).visitorId); pushBoard(); return r; })
  };

  function admin(req, fn) {
    if (!pinOk(req)) throw Object.assign(new Error('forbidden'), { status: 403, code: 'forbidden' });
    return fn();
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://kiosk');
    try {
      if (req.method === 'GET' && url.pathname === '/api/board/stream') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify(engine.leaderboard())}\n\n`);
        streams.add(res);
        req.on('close', () => streams.delete(res));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/export.csv') {
        return admin(req, () => {
          res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="aegis-results.csv"' });
          res.end(engine.exportCsv());
        });
      }
      const route = routes[`${req.method} ${url.pathname}`];
      if (route) {
        const data = await route(req, url);
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        return res.end(JSON.stringify(data));
      }
      if (req.method !== 'GET') throw Object.assign(new Error('not_found'), { status: 404, code: 'not_found' });
      const path = normalize(join(ROOT, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
      if (!path.startsWith(ROOT)) throw Object.assign(new Error('not_found'), { status: 404, code: 'not_found' });
      const file = await readFile(path).catch(() => { throw Object.assign(new Error('not_found'), { status: 404, code: 'not_found' }); });
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
      res.end(file);
    } catch (err) {
      const status = err.status ?? 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: err.code ?? 'server_error' }));
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 1190);
  const adminPin = process.env.ADMIN_PIN;
  if (!adminPin) console.warn('ADMIN_PIN is not set: supervisor page and export are locked.');
  const engine = createEngine({ dbPath: fileURLToPath(new URL('./data/aegis.db', import.meta.url)) });
  createApp({ engine, adminPin }).listen(port, () => {
    console.log(`AEGIS running: kiosk http://localhost:${port}  wall http://localhost:${port}/board.html  admin http://localhost:${port}/admin.html`);
  });
}
