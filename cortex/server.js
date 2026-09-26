// CORTEX kiosk server. Zero dependencies: Node 22.5+ only.
// Runs fully offline on the kiosk machine. Open http://localhost:4029
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { createEngine } from './engine.js';

const ROOT = fileURLToPath(new URL('./public/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json' };

export function createApp({ engine, adminPin }) {
  const pinOk = req => {
    const got = Buffer.from(String(req.headers['x-admin-pin'] ?? ''));
    const want = Buffer.from(String(adminPin));
    return adminPin && got.length === want.length && timingSafeEqual(got, want);
  };

  async function body(req) {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 10_000) throw Object.assign(new Error('too_large'), { status: 413, code: 'too_large' });
    }
    try { return raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error('bad_json'), { status: 400, code: 'bad_json' }); }
  }

  const routes = {
    'GET /api/health': () => ({ ok: true }),
    'GET /api/config': (req, url) => {
      const lang = url.searchParams.get('lang') === 'ar' ? 'ar' : 'en';
      return { event: engine.event[lang], trending: engine.trending(lang) };
    },
    'POST /api/ask': async req => engine.ask(await body(req)),
    'GET /api/entry': (req, url) => engine.entry(url.searchParams.get('id'), url.searchParams.get('lang')),
    'POST /api/handoff': async req => engine.requestHandoff(await body(req)),
    'GET /api/admin/stats': req => admin(req, () => engine.stats()),
    'GET /api/admin/unanswered': req => admin(req, () => engine.unanswered()),
    'GET /api/admin/handoffs': req => admin(req, () => engine.handoffs()),
    'POST /api/admin/resolve': async req => admin(req, async () => engine.resolveHandoff((await body(req)).id)),
    'GET /api/admin/entries': req => admin(req, () => engine.customEntries()),
    'POST /api/admin/entries': async req => admin(req, async () => engine.addEntry(await body(req))),
    'POST /api/admin/entries/delete': async req => admin(req, async () => engine.removeEntry((await body(req)).id))
  };

  function admin(req, fn) {
    if (!pinOk(req)) throw Object.assign(new Error('forbidden'), { status: 403, code: 'forbidden' });
    return fn();
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://kiosk');
    try {
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
  const port = Number(process.env.PORT ?? 4029);
  const adminPin = process.env.ADMIN_PIN;
  if (!adminPin) console.warn('ADMIN_PIN is not set: staff console is locked.');
  const engine = createEngine({ dbPath: fileURLToPath(new URL('./data/cortex.db', import.meta.url)) });
  createApp({ engine, adminPin }).listen(port, () => {
    console.log(`CORTEX running: kiosk http://localhost:${port}  staff console http://localhost:${port}/admin.html`);
  });
}
