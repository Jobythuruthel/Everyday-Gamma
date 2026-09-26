import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../engine.js';
import { createApp } from '../server.js';

test('HTTP flow, admin lock and static safety', async t => {
  const server = createApp({ engine: createEngine(), adminPin: '4242' }).listen(0);
  t.after(() => server.close());
  await new Promise(r => server.once('listening', r));
  const base = `http://localhost:${server.address().port}`;
  const post = (p, b, h = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });

  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/board.html')).status, 200);
  assert.equal((await fetch(base + '/..%2fengine.js')).status, 404, 'no path traversal');
  assert.equal((await post('/api/visitors', { name: 'Ali', mobile: '33445566' })).status, 400);
  assert.equal((await fetch(base + '/api/board', { method: 'POST', body: '{bad' })).status, 404);

  const v = await (await post('/api/visitors', { name: 'Ali Hassan', mobile: '33445566', consentGame: true, lang: 'ar' })).json();
  const r = await (await post('/api/rounds', { visitorId: v.id, mode: 'phish' })).json();
  assert.match(r.title, /تصيّد/);
  let out;
  for (let i = 0; i < r.total; i++) out = await (await post('/api/answer', { roundId: r.roundId, choice: 0 })).json();
  assert.equal(out.done, true);
  assert.equal((await (await fetch(base + '/api/board')).json()).length, 1);

  assert.equal((await fetch(base + '/api/admin/stats')).status, 403);
  assert.equal((await fetch(base + '/api/admin/export.csv', { headers: { 'x-admin-pin': '0000' } })).status, 403);
  const csv = await (await fetch(base + '/api/admin/export.csv', { headers: { 'x-admin-pin': '4242' } })).text();
  assert.match(csv, /Ali Hassan/);
  assert.equal((await post('/api/admin/delete', { visitorId: v.id }, { 'x-admin-pin': '4242' })).status, 200);
  assert.equal((await (await fetch(base + '/api/board')).json()).length, 0);
});
