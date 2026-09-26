import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../engine.js';
import { createApp } from '../server.js';

test('HTTP flow, supervisor lock and static safety', async t => {
  const server = createApp({ engine: createEngine(), adminPin: '1190' }).listen(0);
  t.after(() => server.close());
  await new Promise(r => server.once('listening', r));
  const base = `http://localhost:${server.address().port}`;
  const post = (p, b, h = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });

  for (const p of ['/', '/scene.js', '/board.html', '/admin.html', '/certificate.html']) assert.equal((await fetch(base + p)).status, 200, p);
  assert.equal((await fetch(base + '/..%2fcontent.json')).status, 404);
  assert.equal((await post('/api/visitors', { name: '' })).status, 400);

  const v = await (await post('/api/visitors', { name: 'Fatima Noor', employeeNo: 'J-7' })).json();
  const r = await (await post('/api/rounds', { visitorId: v.id, module: 'ppe' })).json();
  const out = await (await post('/api/submit', { roundId: r.roundId, selections: { height: ['helmet'] } })).json();
  assert.equal(out.module, 'ppe');
  assert.equal((await (await fetch(`${base}/api/progress?visitorId=${v.id}`)).json()).length, 1);
  assert.equal((await (await fetch(base + '/api/board')).json())[0].name, 'Fatima N.');
  assert.equal((await post('/api/submit', { roundId: r.roundId })).status, 404);

  assert.equal((await fetch(base + '/api/admin/stats')).status, 403);
  const stats = await (await fetch(base + '/api/admin/stats', { headers: { 'x-admin-pin': '1190' } })).json();
  assert.equal(stats.plays, 1);
  assert.match(await (await fetch(base + '/api/admin/export.csv', { headers: { 'x-admin-pin': '1190' } })).text(), /Fatima Noor,J-7/);
  assert.equal((await post('/api/admin/delete', { visitorId: v.id }, { 'x-admin-pin': '1190' })).status, 200);
});
