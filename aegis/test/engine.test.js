import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEngine, scoreHazard, scoreLoto, scorePpe, scoreReaction, MODULES } from '../engine.js';

const content = JSON.parse(readFileSync(new URL('../content.json', import.meta.url), 'utf8'));
const clock = () => { let t = Date.parse('2026-11-11T08:00:00Z'); const f = () => t; f.tick = ms => { t += ms; }; return f; };

test('content: bilingual, every hazard has a label and severity, LOTO and PPE reference real ids', () => {
  for (const s of content.hazard.scenes) {
    assert.ok(s.title.en && s.title.ar);
    for (const e of s.elements.filter(e => e.hazard)) assert.ok(e.label.en && e.label.ar && e.severity >= 1, e.id);
    assert.equal(new Set(s.elements.map(e => e.id)).size, s.elements.length, 'unique ids');
  }
  const items = new Set(content.ppe.items.map(i => i.id));
  for (const t of content.ppe.tasks) assert.ok(t.required.every(id => items.has(id)), t.id);
  assert.ok(content.loto.steps.every(s => s.label.en && s.label.ar));
});

test('hazard scoring: finds, wrong flags, empty taps, time bonus, floor at zero', () => {
  const scene = content.hazard.scenes[0];
  const hazards = scene.elements.filter(e => e.hazard).map(e => e.id);
  const safe = scene.elements.find(e => !e.hazard).id;
  const perfect = scoreHazard(scene, { tapped: hazards, elapsedMs: 0 }, 30000);
  assert.equal(perfect.correct, hazards.length);
  assert.equal(perfect.missed.length, 0);
  const sev = scene.elements.filter(e => e.hazard).reduce((s, e) => s + e.severity * 100, 0);
  assert.equal(perfect.score, sev + 200);
  const sloppy = scoreHazard(scene, { tapped: [hazards[0], safe, 'nope'], emptyTaps: 3, elapsedMs: 5000 }, 30000);
  assert.deepEqual(sloppy.wrong, [safe]);
  assert.equal(sloppy.missed.length, hazards.length - 1);
  assert.equal(scoreHazard(scene, { tapped: [safe], emptyTaps: 999, elapsedMs: 1 }, 30000).score, 0);
});

test('LOTO scoring and validation', () => {
  const ids = content.loto.steps.map(s => s.id);
  assert.equal(scoreLoto(content.loto.steps, ids).score, ids.length * 100 + 200);
  const swapped = [ids[1], ids[0], ...ids.slice(2)];
  assert.equal(scoreLoto(content.loto.steps, swapped).correct, ids.length - 2);
  assert.throws(() => scoreLoto(content.loto.steps, ids.slice(1)), /order_invalid/);
  assert.throws(() => scoreLoto(content.loto.steps, [ids[0], ...ids.slice(0, -1)]), /order_invalid/);
});

test('PPE scoring rewards exact loadouts and penalises extras', () => {
  const perfect = Object.fromEntries(content.ppe.tasks.map(t => [t.id, t.required]));
  assert.equal(scorePpe(content.ppe.tasks, perfect).correct, content.ppe.tasks.length);
  const withTie = { ...perfect, height: [...perfect.height, 'tie'] };
  const r = scorePpe(content.ppe.tasks, withTie);
  assert.equal(r.correct, content.ppe.tasks.length - 1);
  assert.equal(scorePpe(content.ppe.tasks, {}).score, 0);
});

test('reaction scoring rejects false starts, misses and impossible values', () => {
  const cfg = content.reaction;
  const r = scoreReaction(cfg, [300, -1, null]);
  assert.equal(r.correct, 1);
  assert.equal(r.avgMs, 300);
  assert.equal(scoreReaction(cfg, [5, 5, 5]).score, 0, 'faster than human is rejected');
  assert.throws(() => scoreReaction(cfg, [300]), /trials_invalid/);
});

test('rounds never leak answers and each round scores once', () => {
  const now = clock();
  const e = createEngine({ content, now });
  const v = e.registerVisitor({ name: 'Omar Khalid', employeeNo: 'J-1042', lang: 'ar' });
  const hz = e.startRound(v.id, 'hazard');
  assert.ok(hz.elements.every(el => !('hazard' in el) && !('label' in el) && !('severity' in el)));
  assert.match(hz.title, /[؀-ۿ]/, 'Arabic visitor gets Arabic content');
  const lt = e.startRound(v.id, 'loto');
  assert.notDeepEqual(lt.steps.map(s => s.id), content.loto.steps.map(s => s.id), 'steps are shuffled');
  const pp = e.startRound(v.id, 'ppe');
  assert.ok(pp.tasks.every(t => !('required' in t)));
  const out = e.submit(lt.roundId, { order: content.loto.steps.map(s => s.id) });
  assert.equal(out.correct, 6);
  assert.equal(out.feedback.length, 6);
  assert.throws(() => e.submit(lt.roundId, { order: [] }), /round_not_found/);
  assert.throws(() => e.startRound(v.id, 'nope'), /unknown_module/);
});

test('reaction round finished faster than its sirens scores zero', () => {
  const now = clock();
  const e = createEngine({ content, now });
  const v = e.registerVisitor({ name: 'Omar Khalid' });
  const r1 = e.startRound(v.id, 'reaction');
  assert.equal(e.submit(r1.roundId, { trials: [250, 250, 250] }).score, 0);
  const r2 = e.startRound(v.id, 'reaction');
  now.tick(r2.delays.reduce((a, b) => a + b, 0) + 1000);
  assert.ok(e.submit(r2.roundId, { trials: [250, 250, 250] }).score > 0);
});

test('certificate, board, stats, export and deletion', () => {
  const now = clock();
  const e = createEngine({ content, now });
  const v = e.registerVisitor({ name: '=cmd Hacker', employeeNo: 'E1' });
  assert.throws(() => e.certificate(v.id), /no_plays/);
  const scene = () => { const r = e.startRound(v.id, 'hazard'); return e.submit(r.roundId, { tapped: [] }); };
  const miss = scene();
  assert.ok(miss.feedback.length > 0, 'missed hazards are explained');
  const lt = e.startRound(v.id, 'loto'); e.submit(lt.roundId, { order: content.loto.steps.map(s => s.id) });
  const pp = e.startRound(v.id, 'ppe'); e.submit(pp.roundId, { selections: Object.fromEntries(content.ppe.tasks.map(t => [t.id, t.required])) });
  const rx = e.startRound(v.id, 'reaction'); now.tick(20000); e.submit(rx.roundId, { trials: [300, 400, 500] });
  const cert = e.certificate(v.id);
  assert.equal(cert.complete, true);
  assert.equal(cert.modules.length, MODULES.length);
  assert.equal(e.leaderboard()[0].score, cert.total);
  const s = e.stats();
  assert.equal(s.certified, 1);
  assert.equal(s.avgReactionMs, 400);
  assert.ok(s.mostMissedHazards.length > 0 && s.mostMissedHazards[0].label);
  assert.match(e.exportCsv(), /'=cmd Hacker,E1,.*,4,yes,/);
  e.deleteVisitor(v.id);
  assert.equal(e.stats().visitors, 0);
  assert.equal(e.stats().plays, 0);
});
