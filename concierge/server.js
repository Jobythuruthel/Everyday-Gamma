// CONCIERGE kiosk server. Zero dependencies: Node 22.5+ only.
// Runs fully offline on the kiosk machine. Open http://localhost:8091
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { createEngine } from './engine.js';
import { sendZpl } from './printer.js';

const ROOT = fileURLToPath(new URL('./public/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json' };

// Background delivery: badges to the Zebra printer, VIP alerts to a webhook (WhatsApp, Teams or email via your automation tool).
export async function runWorkers(engine, { printer, webhookUrl, fetchImpl = fetch } = {}) {
  if (printer?.host) {
    for (const job of engine.pendingPrints()) {
      try { await sendZpl(printer.host, printer.port ?? 9100, job.zpl); engine.markPrint(job.id, true); }
      catch (err) { engine.markPrint(job.id, false, err.message); break; } // printer down: stop and retry the queue later
    }
  }
  if (webhookUrl) {
    for (const a of engine.pendingWebhooks()) {
      try {
        const res = await fetchImpl(webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          type: 'vip_arrival', name: a.name, company: a.company, host: a.host_name, hostContact: a.host_contact, arrivedAt: new Date(a.checked_in_at).toISOString()
        }), signal: AbortSignal.timeout(5000) });
        engine.markWebhook(a.id, res.ok);
      } catch { engine.markWebhook(a.id, false); break; }
    }
  }
}

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
      if (raw.length > 2_000_000) throw Object.assign(new Error('too_large'), { status: 413, code: 'too_large' });
    }
    try { return raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error('bad_json'), { status: 400, code: 'bad_json' }); }
  }

  const routes = {
    'GET /api/health': () => ({ ok: true }),
    'POST /api/checkin': async req => engine.checkIn(await body(req)),
    'POST /api/walkin': async req => engine.walkIn(await body(req)),
    'GET /api/badge': (req, url) => engine.badge(url.searchParams.get('code')),
    'GET /api/admin/stats': req => admin(req, () => engine.stats()),
    'GET /api/admin/arrivals': req => admin(req, () => engine.arrivals()),
    'GET /api/admin/alerts': req => admin(req, () => engine.alerts()),
    'POST /api/admin/ack': async req => admin(req, async () => engine.ackAlert((await body(req)).id)),
    'POST /api/admin/import': async req => admin(req, async () => engine.importCsv((await body(req)).csv)),
    'POST /api/admin/reprint': async req => admin(req, async () => engine.reprint((await body(req)).id)),
    'POST /api/admin/retry-prints': req => admin(req, () => engine.retryFailedPrints())
  };

  function admin(req, fn) {
    if (!pinOk(req)) throw Object.assign(new Error('forbidden'), { status: 403, code: 'forbidden' });
    return fn();
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://kiosk');
    try {
      if (req.method === 'GET' && url.pathname === '/api/admin/export.csv') {
        return admin(req, () => {
          res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="concierge-attendees.csv"' });
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
  const port = Number(process.env.PORT ?? 8091);
  const adminPin = process.env.ADMIN_PIN;
  const printer = process.env.PRINTER_HOST ? { host: process.env.PRINTER_HOST, port: Number(process.env.PRINTER_PORT ?? 9100) } : null;
  const webhookUrl = process.env.HOST_WEBHOOK || null;
  if (!adminPin) console.warn('ADMIN_PIN is not set: the staff console is locked.');
  console.log(printer ? `Printing badges to Zebra at ${printer.host}:${printer.port}` : 'PRINTER_HOST not set: badges open in the browser print dialog instead.');
  const engine = createEngine({ dbPath: fileURLToPath(new URL('./data/concierge.db', import.meta.url)), printerEnabled: Boolean(printer), webhookEnabled: Boolean(webhookUrl) });
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try { await runWorkers(engine, { printer, webhookUrl }); } finally { busy = false; }
  }, 1500);
  createApp({ engine, adminPin }).listen(port, () => {
    console.log(`CONCIERGE running: kiosk http://localhost:${port}  staff http://localhost:${port}/admin.html`);
  });
}
