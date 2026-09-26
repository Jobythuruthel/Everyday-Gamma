// MUSE photobooth server. Zero dependencies: Node 22.5+ only.
// Runs offline on the kiosk machine. Visitors' phones download photos over the booth Wi-Fi. Open http://localhost:9206
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { timingSafeEqual } from 'node:crypto';
import { createEngine, generateWithApi, decodeJpegDataUrl } from './engine.js';

const ROOT = fileURLToPath(new URL('./public/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const err = (status, code) => Object.assign(new Error(code), { status, code });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function lanUrl(port) {
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) return `http://${i.address}:${port}`;
  }
  return `http://localhost:${port}`;
}

export function createApp({ engine, styles, adminPin, publicUrl, imageApi = null }) {
  const pinOk = req => {
    const got = Buffer.from(String(req.headers['x-admin-pin'] ?? ''));
    const want = Buffer.from(String(adminPin));
    return adminPin && got.length === want.length && timingSafeEqual(got, want);
  };
  const admin = (req, fn) => { if (!pinOk(req)) throw err(403, 'forbidden'); return fn(); };

  async function body(req, limit = 8_000_000) {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > limit) throw err(413, 'too_large');
    }
    try { return raw ? JSON.parse(raw) : {}; } catch { throw err(400, 'bad_json'); }
  }

  const routes = {
    'GET /api/health': () => ({ ok: true }),
    'GET /api/config': () => ({ event: styles.event, hashtag: styles.hashtag, styles: styles.styles.map(({ prompt, ...s }) => s), engine: imageApi ? 'api' : 'local' }),
    'POST /api/generate': async req => {
      if (!imageApi) throw err(409, 'api_disabled');
      const b = await body(req);
      const style = styles.styles.find(s => s.id === b.styleId);
      if (!style) throw err(400, 'unknown_style');
      if (b.consentFace !== true) throw err(400, 'consent_required');
      const image = decodeJpegDataUrl(b.image);
      try {
        const out = await imageApi.generate({ image, prompt: style.prompt });
        return { image: `data:image/png;base64,${out.toString('base64')}` };
      } catch (e) {
        console.error('image API failed, falling back to local style:', e.message);
        return { fallback: true };
      }
    },
    'POST /api/photos': async req => engine.savePhoto(await body(req)),
    'POST /api/lead': async req => {
      const b = await body(req);
      const { token } = engine.captureLead(b.id, b);
      return { token, url: `${publicUrl}/p/${token}` };
    },
    'GET /api/gallery': () => engine.gallery(),
    'GET /api/admin/stats': req => admin(req, () => engine.stats()),
    'GET /api/admin/pending': req => admin(req, () => engine.pending()),
    'POST /api/admin/review': async req => admin(req, async () => { const b = await body(req); return engine.review(b.id, b.decision); }),
    'POST /api/admin/delete': async req => admin(req, async () => engine.deletePhoto((await body(req)).id)),
    'POST /api/admin/purge': req => admin(req, () => engine.purgeExpired())
  };

  const jpeg = (res, bytes, extra = {}) => { res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store', ...extra }); res.end(bytes); };

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://kiosk');
    const path = url.pathname;
    try {
      let m;
      if (req.method === 'GET' && (m = /^\/g\/([\w-]{36})\.jpg$/.exec(path))) return jpeg(res, engine.galleryImage(m[1]));
      if (req.method === 'GET' && (m = /^\/p\/([\w-]{16})\.jpg$/.exec(path))) {
        const dl = url.searchParams.has('dl');
        const { bytes } = engine.byToken(m[1], { count: dl });
        return jpeg(res, bytes, dl ? { 'content-disposition': `attachment; filename="muse-${m[1].slice(0, 6)}.jpg"` } : {});
      }
      if (req.method === 'GET' && (m = /^\/p\/([\w-]{16})$/.exec(path))) {
        engine.byToken(m[1]);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(downloadPage(m[1], styles));
      }
      if (req.method === 'GET' && path === '/api/admin/image') return admin(req, () => jpeg(res, engine.adminImage(url.searchParams.get('id'))));
      if (req.method === 'GET' && path === '/api/admin/export.csv') {
        return admin(req, () => {
          res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="muse-leads.csv"' });
          res.end(engine.exportCsv());
        });
      }
      const route = routes[`${req.method} ${path}`];
      if (route) {
        const data = await route(req, url);
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        return res.end(JSON.stringify(data));
      }
      if (req.method !== 'GET') throw err(404, 'not_found');
      const file = normalize(join(ROOT, path === '/' ? 'index.html' : decodeURIComponent(path)));
      if (!file.startsWith(ROOT)) throw err(404, 'not_found');
      const data = await readFile(file).catch(() => { throw err(404, 'not_found'); });
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(data);
    } catch (e) {
      const status = e.status ?? 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: e.code ?? 'server_error' }));
    }
  });
}

function downloadPage(token, styles) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,">
<title>Your MUSE photo</title><style>body{margin:0;background:#040705;color:#F2F5F0;font:17px Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}
main{width:min(480px,100%);display:grid;gap:16px}img{width:100%;border-radius:16px;display:block}a{display:block;text-align:center;background:#6FBD44;color:#040705;font-weight:700;padding:18px;border-radius:14px;text-decoration:none}
p{color:rgba(242,245,240,.62);margin:0;text-align:center;font-size:14px}</style></head><body><main>
<img src="/p/${esc(token)}.jpg" alt="Your photo"><a href="/p/${esc(token)}.jpg?dl=1" download>Save photo · حفظ الصورة</a>
<p>${esc(styles.event.en)} · ${esc(styles.hashtag)}</p><p>FX-9206 MUSE · Joby Thuruthel | FAIM</p></main></body></html>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 9206);
  const adminPin = process.env.ADMIN_PIN;
  const publicUrl = (process.env.PUBLIC_URL || lanUrl(port)).replace(/\/$/, '');
  const styles = JSON.parse(readFileSync(new URL('./styles.json', import.meta.url), 'utf8'));
  const apiKey = process.env.IMAGE_API_KEY;
  const imageApi = apiKey ? {
    generate: ({ image, prompt }) => generateWithApi({ image, prompt, apiKey, url: process.env.IMAGE_API_URL || undefined, model: process.env.IMAGE_API_MODEL || undefined })
  } : null;
  if (!adminPin) console.warn('ADMIN_PIN is not set: the operator page is locked.');
  console.log(imageApi ? 'Generative styles ON (image API key found).' : 'Offline styles (no IMAGE_API_KEY). The camera image never leaves this machine.');
  const engine = createEngine({
    dbPath: fileURLToPath(new URL('./data/muse.db', import.meta.url)),
    photoDir: fileURLToPath(new URL('./data/photos/', import.meta.url)),
    styles, retentionDays: Number(process.env.RETENTION_DAYS ?? 30)
  });
  engine.purgeExpired();
  setInterval(() => engine.purgeExpired(), 3600000);
  createApp({ engine, styles, adminPin, publicUrl, imageApi }).listen(port, () => {
    console.log(`MUSE running: kiosk http://localhost:${port}  operator http://localhost:${port}/admin.html  phones download from ${publicUrl}`);
  });
}
