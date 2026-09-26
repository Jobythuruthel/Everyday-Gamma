import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../engine.js';
import { createApp } from '../server.js';
import { styles, tmp, jpegDataUrl } from './helpers.js';

async function start(t, opts = {}) {
  const server = createApp({ engine: createEngine({ photoDir: tmp(), styles }), styles, adminPin: '9206', publicUrl: 'http://10.0.0.5:9206', ...opts }).listen(0);
  t.after(() => server.close());
  await new Promise(r => server.once('listening', r));
  const base = `http://localhost:${server.address().port}`;
  const post = (p, b, h = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });
  return { base, post };
}

test('full visitor flow over HTTP, lead-gated download, operator approval', async t => {
  const { base, post } = await start(t);
  for (const p of ['/', '/render.js', '/admin.html', '/vendor/qrcode.js']) assert.equal((await fetch(base + p)).status, 200, p);
  const cfg = await (await fetch(base + '/api/config')).json();
  assert.equal(cfg.engine, 'local');
  assert.ok(cfg.styles.every(s => !('prompt' in s)), 'prompts stay on the server');
  assert.equal((await post('/api/generate', { styleId: 'cyber', image: jpegDataUrl(), consentFace: true })).status, 409);

  const { id } = await (await post('/api/photos', { image: jpegDataUrl(), styleId: 'cyber', consentFace: true })).json();
  const lead = await (await post('/api/lead', { id, email: 'guest@example.com' })).json();
  assert.equal(lead.url, `http://10.0.0.5:9206/p/${lead.token}`);
  const page = await (await fetch(`${base}/p/${lead.token}`)).text();
  assert.match(page, /Save photo/);
  const dl = await fetch(`${base}/p/${lead.token}.jpg?dl=1`);
  assert.equal(dl.headers.get('content-type'), 'image/jpeg');
  assert.match(dl.headers.get('content-disposition'), /attachment/);
  assert.equal((await fetch(`${base}/p/${'a'.repeat(16)}`)).status, 404);

  assert.equal((await fetch(`${base}/g/${id}.jpg`)).status, 404, 'not public until approved');
  assert.equal((await fetch(`${base}/api/admin/pending`)).status, 403);
  const pending = await (await fetch(`${base}/api/admin/pending`, { headers: { 'x-admin-pin': '9206' } })).json();
  assert.equal(pending[0].id, id);
  assert.equal((await fetch(`${base}/api/admin/image?id=${id}`, { headers: { 'x-admin-pin': '9206' } })).status, 200);
  await post('/api/admin/review', { id, decision: 'approved' }, { 'x-admin-pin': '9206' });
  assert.equal((await fetch(`${base}/g/${id}.jpg`)).status, 200);
  assert.equal((await (await fetch(`${base}/api/gallery`)).json()).length, 1);
});

test('generative mode: returns the API image, and falls back when the API fails', async t => {
  let fail = false;
  const imageApi = { generate: async () => { if (fail) throw new Error('down'); return Buffer.from('png-bytes'); } };
  const { post } = await start(t, { imageApi });
  const ok = await (await post('/api/generate', { styleId: 'space', image: jpegDataUrl(), consentFace: true })).json();
  assert.equal(ok.image, 'data:image/png;base64,' + Buffer.from('png-bytes').toString('base64'));
  assert.equal((await post('/api/generate', { styleId: 'space', image: jpegDataUrl() })).status, 400, 'consent enforced on the server');
  fail = true;
  assert.deepEqual(await (await post('/api/generate', { styleId: 'space', image: jpegDataUrl(), consentFace: true })).json(), { fallback: true });
});
