import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEngine } from '../engine.js';
await import('../public/presence.js');
const P = globalThis.Presence;
const guests = readFileSync(new URL('../sample-guests.csv', import.meta.url), 'utf8');

const W = 160, H = 90;
const frame = (fill = 0) => new Uint8Array(W * H).fill(fill);
function withPerson(base, { x0, x1, y0, y1 }) {
  const f = Uint8Array.from(base);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) f[y * W + x] = 200;
  return f;
}

test('motion box: empty scene, far person, near person, and horizontal position', () => {
  const bg = frame(40);
  assert.equal(P.motionBox(bg, bg, W, H).energy, 0);
  const far = P.motionBox(bg, withPerson(bg, { x0: 20, x1: 30, y0: 30, y1: 50 }), W, H);
  const near = P.motionBox(bg, withPerson(bg, { x0: 100, x1: 140, y0: 5, y1: 85 }), W, H);
  assert.equal(P.zoneFor(P.motionBox(bg, bg, W, H)), 'empty');
  assert.equal(P.zoneFor(far), 'passing');
  assert.equal(P.zoneFor(near), 'interaction');
  assert.equal(P.zoneFor(P.motionBox(bg, withPerson(bg, { x0: 60, x1: 90, y0: 20, y1: 60 }), W, H)), 'attention');
  assert.ok(far.cx < 0.25 && near.cx > 0.6);
  assert.ok(P.motionBox(bg, bg.map(v => v + 10), W, H).energy === 0, 'small lighting changes are ignored');
});

test('tracker: needs consecutive frames to change zone, and a still person keeps their zone', () => {
  const tr = P.createTracker({ hold: 3, linger: 5 });
  assert.equal(tr('interaction'), 'empty');
  assert.equal(tr('interaction'), 'empty');
  assert.equal(tr('interaction'), 'interaction');
  assert.equal(tr('passing'), 'interaction', 'one noisy frame does not change zone');
  for (let i = 0; i < 4; i++) assert.equal(tr('empty'), 'interaction', 'standing still');
  for (let i = 0; i < 3; i++) tr('empty');
  assert.equal(tr('empty'), 'empty', 'left after linger');
});

test('greeting text: time of day, name, language, and generic fallback', () => {
  const event = { en: 'Demo Summit', ar: 'القمة' };
  assert.equal(P.greeting({ name: 'Sara', lang: 'en', hour: 9, event }), 'Good morning, Sara. Welcome to Demo Summit.');
  assert.equal(P.greeting({ name: null, lang: 'en', hour: 15, event }), 'Good afternoon, and welcome to Demo Summit. How can I help?');
  assert.match(P.greeting({ name: 'خالد', lang: 'ar', hour: 19, event }), /^مساء الخير يا خالد\. أهلاً بك في القمة\.$/);
});

test('guest list: import, first-name greeting, language, unknown badge', () => {
  const e = createEngine();
  assert.deepEqual(e.importGuests(guests), { imported: 2, errors: [] });
  assert.deepEqual(e.guest(' vip0001 '), { name: 'Sara', title: 'CEO Gulf Energy Co', lang: 'en' });
  assert.equal(e.guest('VIP0002').lang, 'ar');
  assert.throws(() => e.guest('NOPE'), /guest_not_found/);
  assert.equal(e.importGuests('code,name\nVIP0001,Sara Renamed\n,\n').imported, 1);
  assert.equal(e.guest('VIP0001').name, 'Sara');
  assert.throws(() => e.importGuests('name\nx'), /csv_needs_code_and_name/);
});

test('visit analytics: approach rate, greetings, dwell and caps', () => {
  const e = createEngine();
  e.logVisit({ maxZone: 'passing', dwellMs: 2000 });
  e.logVisit({ maxZone: 'attention', dwellMs: 6000 });
  e.logVisit({ maxZone: 'interaction', greeted: true, named: true, questions: 2, dwellMs: 14000, lang: 'ar' });
  e.logVisit({ maxZone: 'interaction', greeted: true, dwellMs: 99 * 3600000 });
  assert.throws(() => e.logVisit({ maxZone: 'empty' }), /zone_invalid/);
  const s = e.stats();
  assert.equal(s.passersBy, 4);
  assert.equal(s.approaches, 3);
  assert.equal(s.approachRate, 75);
  assert.equal(s.greeted, 2);
  assert.equal(s.namedGreetings, 1);
  assert.equal(s.questions, 2);
  assert.equal(s.avgDwellSec, Math.round((6000 + 14000 + 1800000) / 3 / 100) / 10, 'dwell capped at 30 minutes');
});
