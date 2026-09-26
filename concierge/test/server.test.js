import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { createEngine } from '../engine.js';
import { createApp, runWorkers } from '../server.js';

const sample = readFileSync(new URL('../sample-attendees.csv', import.meta.url), 'utf8');

function fakeZebra() {
  const labels = [];
  const srv = net.createServer(sock => { let buf = ''; sock.on('data', d => { buf += d; }); sock.on('end', () => labels.push(buf)); });
  return new Promise(r => srv.listen(0, () => r({ srv, labels, port: srv.address().port })));
}

test('badges reach a Zebra over TCP; a dead printer keeps jobs queued', async t => {
  const zebra = await fakeZebra();
  t.after(() => zebra.srv.close());
  const e = createEngine({ printerEnabled: true });
  e.importCsv(sample);
  e.checkIn({ code: 'EXH0004' });
  await runWorkers(e, { printer: { host: '127.0.0.1', port: 1 } }); // nothing listening
  assert.equal(e.pendingPrints().length, 1, 'still queued after failure');
  await runWorkers(e, { printer: { host: '127.0.0.1', port: zebra.port } });
  await new Promise(r => setTimeout(r, 50));
  assert.equal(zebra.labels.length, 1);
  assert.match(zebra.labels[0], /Test Name_5FWith_5ECaret_7E/);
  assert.equal(e.pendingPrints().length, 0);
});

test('VIP webhook posts the arrival and retries on failure', async () => {
  const e = createEngine({ webhookEnabled: true });
  e.importCsv(sample);
  e.checkIn({ code: 'VIP0001' });
  const sent = [];
  await runWorkers(e, { webhookUrl: 'http://hook', fetchImpl: async () => ({ ok: false }) });
  assert.equal(e.pendingWebhooks().length, 1);
  await runWorkers(e, { webhookUrl: 'http://hook', fetchImpl: async (url, opt) => { sent.push(JSON.parse(opt.body)); return { ok: true }; } });
  assert.equal(sent[0].name, 'Sara Al-Mansoori');
  assert.equal(sent[0].host, 'Joby T.');
  assert.equal(e.pendingWebhooks().length, 0);
});

test('HTTP flow and staff lock', async t => {
  const server = createApp({ engine: createEngine(), adminPin: '8091' }).listen(0);
  t.after(() => server.close());
  await new Promise(r => server.once('listening', r));
  const base = `http://localhost:${server.address().port}`;
  const post = (p, b, h = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });
  const staff = { 'x-admin-pin': '8091' };
  for (const p of ['/', '/badge.html', '/admin.html', '/vendor/qrcode.js']) assert.equal((await fetch(base + p)).status, 200, p);
  assert.equal((await post('/api/admin/import', { csv: sample })).status, 403);
  assert.equal((await (await post('/api/admin/import', { csv: sample }, staff)).json()).added, 4);
  const t0 = performance.now();
  const r = await (await post('/api/checkin', { code: 'SPK0003' })).json();
  const ms = performance.now() - t0;
  assert.equal(r.name, 'Layla Haddad');
  assert.ok(ms < 300, `round trip ${ms.toFixed(0)} ms`);
  assert.equal((await post('/api/checkin', { code: 'x' })).status, 404);
  assert.equal((await (await fetch(base + '/api/badge?code=SPK0003')).json()).company, 'Haddad, Partners & Co');
  assert.equal((await (await post('/api/walkin', { name: 'New Person', mobile: '+97330000000' })).json()).first, true);
  const arrivals = await (await fetch(base + '/api/admin/arrivals', { headers: staff })).json();
  assert.equal(arrivals.length, 2);
  assert.match(await (await fetch(base + '/api/admin/export.csv', { headers: staff })).text(), /Layla Haddad/);
});
