import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEngine } from '../engine.js';
import { createApp } from '../server.js';
const guests = readFileSync(new URL('../sample-guests.csv', import.meta.url), 'utf8');
const event = { en: 'Demo', ar: 'تجربة' };

async function start(t, opts = {}) {
  const server = createApp({ engine: createEngine(), adminPin: '7248', event, ...opts }).listen(0);
  t.after(() => { server.closeAllConnections(); server.close(); });
  await new Promise(r => server.once('listening', r));
  const base = `http://localhost:${server.address().port}`;
  const post = (p, b, h = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });
  return { base, post };
}

test('sensor posts reach the hologram page over SSE; distance maps to zones', async t => {
  const { base, post } = await start(t);
  const ac = new AbortController();
  const res = await fetch(base + '/api/presence/stream', { signal: ac.signal });
  const reader = res.body.getReader();
  const got = [];
  const reading = (async () => { let buf = ''; while (got.length < 3) { const { value } = await reader.read(); buf += new TextDecoder().decode(value); for (const m of buf.matchAll(/data: (.+)\n\n/g)) got.push(JSON.parse(m[1]).zone); buf = buf.slice(buf.lastIndexOf('\n\n') + 2); } })();
  await new Promise(r => setTimeout(r, 50));
  assert.deepEqual(await (await post('/api/presence', { distance: 1.2 })).json(), { zone: 'interaction' });
  await post('/api/presence', { distance: 2.5 });
  await post('/api/presence', { zone: 'empty' });
  await reading;
  ac.abort();
  assert.deepEqual(got, ['interaction', 'attention', 'empty']);
  assert.equal((await post('/api/presence', { zone: 'nearby' })).status, 400);
  assert.equal((await (await post('/api/presence', { distance: 9 })).json()).zone, 'empty');
});

test('pages, guests, visits, operator lock, and CORTEX link off by default', async t => {
  const { base, post } = await start(t);
  for (const p of ['/', '/app.js', '/figure.js', '/presence.js', '/admin.html']) assert.equal((await fetch(base + p)).status, 200, p);
  assert.deepEqual(await (await fetch(base + '/api/config')).json(), { event, cortex: false });
  assert.equal((await post('/api/admin/guests', { csv: guests })).status, 403);
  assert.equal((await (await post('/api/admin/guests', { csv: guests }, { 'x-admin-pin': '7248' })).json()).imported, 2);
  assert.equal((await (await fetch(base + '/api/guest?code=VIP0002')).json()).name, 'خالد');
  assert.equal((await fetch(base + '/api/guest?code=X')).status, 404);
  assert.equal((await post('/api/visit', { maxZone: 'interaction', greeted: true, dwellMs: 5000 })).status, 200);
  assert.equal((await (await fetch(base + '/api/admin/stats', { headers: { 'x-admin-pin': '7248' } })).json()).greeted, 1);
  assert.equal((await post('/api/ask', { text: 'hi' })).status, 409);
  assert.deepEqual(await (await post('/api/handoff', {})).json(), { sent: false });
});

test('CORTEX link: proxies questions, and survives CORTEX being down', async t => {
  let down = false;
  const fetchImpl = async (url, opt) => { if (down) throw new Error('ECONNREFUSED'); assert.equal(url, 'http://cortex:4029/api/ask'); return { json: async () => ({ action: 'answer', answer: 'Hall A at 10:00.', q: JSON.parse(opt.body) }) }; };
  const { post } = await start(t, { cortexUrl: 'http://cortex:4029', fetchImpl });
  const r = await (await post('/api/ask', { text: 'keynote?', lang: 'ar' })).json();
  assert.equal(r.answer, 'Hall A at 10:00.');
  assert.deepEqual(r.q, { text: 'keynote?', lang: 'ar', via: 'voice' });
  assert.equal(r.q.lang, 'ar');
  down = true;
  assert.equal((await (await post('/api/ask', { text: 'keynote?' })).json()).action, 'refuse');
  assert.deepEqual(await (await post('/api/handoff', { question: 'x' })).json(), { sent: false }, 'CORTEX down: visitor is sent to the desk');
});
