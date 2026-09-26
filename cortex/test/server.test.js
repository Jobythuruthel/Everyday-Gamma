import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../engine.js';
import { createApp } from '../server.js';

test('HTTP flow, staff lock and static safety', async t => {
  const server = createApp({ engine: createEngine(), adminPin: '4029' }).listen(0);
  t.after(() => server.close());
  await new Promise(r => server.once('listening', r));
  const base = `http://localhost:${server.address().port}`;
  const post = (p, b, h = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });
  const staff = { 'x-admin-pin': '4029' };

  for (const p of ['/', '/app.js', '/admin.html']) assert.equal((await fetch(base + p)).status, 200, p);
  assert.equal((await fetch(base + '/..%2fknowledge.json')).status, 404);
  const cfg = await (await fetch(base + '/api/config?lang=ar')).json();
  assert.match(cfg.event, /[؀-ۿ]/);
  assert.equal(cfg.trending.length, 4);

  const a = await (await post('/api/ask', { text: 'where is the prayer room', lang: 'en' })).json();
  assert.equal(a.action, 'answer');
  const r = await (await post('/api/ask', { text: 'Who won the match?', lang: 'en' })).json();
  assert.equal(r.action, 'refuse');
  assert.equal((await post('/api/ask', { text: '' })).status, 400);
  assert.equal((await post('/api/handoff', { question: 'Who won the match?', lang: 'en' })).status, 200);

  assert.equal((await fetch(base + '/api/admin/handoffs')).status, 403);
  const h = await (await fetch(base + '/api/admin/handoffs', { headers: staff })).json();
  assert.equal(h.length, 1);
  assert.equal((await (await fetch(base + '/api/admin/unanswered', { headers: staff })).json())[0].text, 'Who won the match?');
  assert.equal((await post('/api/admin/entries', { question: 'Who won the match?', answer: 'We do not cover sports results.', lang: 'en' })).status, 403);
  assert.equal((await post('/api/admin/entries', { question: 'Who won the match?', answer: 'We do not cover sports results.', lang: 'en' }, staff)).status, 200);
  assert.equal((await (await post('/api/ask', { text: 'who won the match', lang: 'en' })).json()).answer, 'We do not cover sports results.');
  assert.equal((await post('/api/admin/resolve', { id: h[0].id }, staff)).status, 200);
});
