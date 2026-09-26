// LUMEN hologram server. Zero dependencies: Node 22.5+ only.
// Runs offline on the player machine. Open http://localhost:7248 on the hologram output.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { createEngine } from './engine.js';

const ROOT = fileURLToPath(new URL('./public/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json' };

// cortexUrl: optional link to a CORTEX server for follow-up questions. LUMEN works without it.
export function createApp({ engine, adminPin, event, cortexUrl = null, fetchImpl = fetch }) {
  const streams = new Set();
  const pushPresence = msg => { for (const res of streams) res.write(`data: ${JSON.stringify(msg)}\n\n`); };

  const pinOk = req => {
    const got = Buffer.from(String(req.headers['x-admin-pin'] ?? ''));
    const want = Buffer.from(String(adminPin));
    return adminPin && got.length === want.length && timingSafeEqual(got, want);
  };

  async function body(req) {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 500_000) throw Object.assign(new Error('too_large'), { status: 413, code: 'too_large' });
    }
    try { return raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error('bad_json'), { status: 400, code: 'bad_json' }); }
  }

  const ZONES = ['empty', 'passing', 'attention', 'interaction'];
  const routes = {
    'GET /api/health': () => ({ ok: true }),
    'GET /api/config': () => ({ event, cortex: Boolean(cortexUrl) }),
    'GET /api/guest': (req, url) => engine.guest(url.searchParams.get('code')),
    'POST /api/visit': async req => engine.logVisit(await body(req)),
    // Any external sensor (ESP32 time-of-flight, LiDAR, pressure mat) can drive LUMEN by posting a zone or a distance in metres.
    'POST /api/presence': async req => {
      const b = await body(req);
      let zone = b.zone;
      if (zone === undefined && Number.isFinite(Number(b.distance))) {
        const d = Number(b.distance);
        zone = d <= 0 || d > 6 ? 'empty' : d < 2 ? 'interaction' : d < 3 ? 'attention' : 'passing';
      }
      if (!ZONES.includes(zone)) throw Object.assign(new Error('zone_invalid'), { status: 400, code: 'zone_invalid' });
      pushPresence({ zone, source: 'sensor' });
      return { zone };
    },
    'POST /api/ask': async req => {
      if (!cortexUrl) throw Object.assign(new Error('cortex_not_configured'), { status: 409, code: 'cortex_not_configured' });
      const b = await body(req);
      try {
        const r = await fetchImpl(`${cortexUrl}/api/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: b.text, lang: b.lang, via: 'voice' }), signal: AbortSignal.timeout(4000) });
        return await r.json();
      } catch {
        return { action: 'refuse', reason: 'cortex_unreachable', suggestions: [] };
      }
    },
    // With CORTEX linked, "Call a person" appears on the CORTEX staff console. Without it, LUMEN asks the visitor to go to the desk.
    'POST /api/handoff': async req => {
      if (!cortexUrl) return { sent: false };
      const b = await body(req);
      try {
        const r = await fetchImpl(`${cortexUrl}/api/handoff`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: `LUMEN: ${b.question ?? 'visitor asked for a person'}`, lang: b.lang }), signal: AbortSignal.timeout(4000) });
        return { sent: r.ok };
      } catch { return { sent: false }; }
    },
    'GET /api/admin/stats': req => admin(req, () => engine.stats()),
    'POST /api/admin/guests': async req => admin(req, async () => engine.importGuests((await body(req)).csv))
  };

  function admin(req, fn) {
    if (!pinOk(req)) throw Object.assign(new Error('forbidden'), { status: 403, code: 'forbidden' });
    return fn();
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://kiosk');
    try {
      if (req.method === 'GET' && url.pathname === '/api/presence/stream') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(': connected\n\n');
        streams.add(res);
        req.on('close', () => streams.delete(res));
        return;
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
  const port = Number(process.env.PORT ?? 7248);
  const adminPin = process.env.ADMIN_PIN;
  const event = { en: process.env.EVENT_NAME_EN || 'FAIM Demo Summit 2026', ar: process.env.EVENT_NAME_AR || 'قمة فايم التجريبية ٢٠٢٦' };
  const cortexUrl = (process.env.CORTEX_URL || '').replace(/\/$/, '') || null;
  if (!adminPin) console.warn('ADMIN_PIN is not set: the operator page is locked.');
  console.log(cortexUrl ? `Follow-up questions go to CORTEX at ${cortexUrl}` : 'CORTEX_URL not set: LUMEN greets and guides, and sends questions to staff.');
  const engine = createEngine({ dbPath: fileURLToPath(new URL('./data/lumen.db', import.meta.url)) });
  createApp({ engine, adminPin, event, cortexUrl }).listen(port, () => {
    console.log(`LUMEN running: hologram http://localhost:${port}  operator http://localhost:${port}/admin.html  sensor POST http://<this-ip>:${port}/api/presence`);
  });
}
