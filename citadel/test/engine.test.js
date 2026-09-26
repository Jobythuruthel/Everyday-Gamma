import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, score, MAX_PLAYS_PER_MODE_PER_DAY, QUESTIONS_PER_ROUND } from '../engine.js';

const bank = JSON.parse((await import('node:fs')).readFileSync(new URL('../questions.json', import.meta.url), 'utf8'));
const clock = () => { let t = Date.parse('2026-10-15T09:00:00Z'); const f = () => t; f.tick = ms => { t += ms; }; return f; };
const reg = (e, extra = {}) => e.registerVisitor({ name: 'Sara Ahmed', mobile: '+966 50 123 4567', consentGame: true, ...extra });
const answerFor = id => Object.values(bank.modes).flatMap(m => m.questions).find(q => q.id === id).answer;

test('score: time decay with 10% floor, zero when wrong', () => {
  assert.equal(score({ correct: true, difficulty: 2, elapsedMs: 0, timeLimitMs: 10000 }), 200);
  assert.equal(score({ correct: true, difficulty: 1, elapsedMs: 5000, timeLimitMs: 10000 }), 50);
  assert.equal(score({ correct: true, difficulty: 1, elapsedMs: 10000, timeLimitMs: 10000 }), 10);
  assert.equal(score({ correct: false, difficulty: 3, elapsedMs: 0, timeLimitMs: 10000 }), 0);
});

test('question bank: every question has EN and AR text and a valid answer', () => {
  for (const [mode, m] of Object.entries(bank.modes)) {
    assert.ok(m.questions.length >= QUESTIONS_PER_ROUND, mode);
    for (const q of m.questions) {
      assert.ok(q.prompt.en && q.prompt.ar && q.why.en && q.why.ar, q.id);
      assert.ok(q.options.every(o => o.en && o.ar), q.id);
      assert.ok(q.answer >= 0 && q.answer < q.options.length, q.id);
    }
  }
});

test('registration requires name, mobile and explicit game consent', () => {
  const e = createEngine({ bank });
  assert.throws(() => e.registerVisitor({ name: 'S', mobile: '1234567', consentGame: true }), /name_required/);
  assert.throws(() => e.registerVisitor({ name: 'Sara', mobile: '12', consentGame: true }), /mobile_invalid/);
  assert.throws(() => e.registerVisitor({ name: 'Sara', mobile: '1234567', consentGame: 'yes' }), /consent_required/);
  assert.ok(reg(e).id);
});

test('full round: server scores, hides answers, records play, updates board', () => {
  const now = clock();
  const e = createEngine({ bank, now });
  const v = reg(e);
  let r = e.startRound(v.id, 'phish');
  assert.equal(r.question.answer, undefined, 'answer must not reach the client');
  let out;
  for (let i = 0; i < QUESTIONS_PER_ROUND; i++) {
    now.tick(1000);
    const q = out ? out.question : r.question;
    out = e.answer(r.roundId, answerFor(q.id));
    assert.equal(out.correct, true);
  }
  assert.equal(out.done, true);
  assert.equal(out.result.correct, QUESTIONS_PER_ROUND);
  assert.equal(out.result.rank, 1);
  assert.equal(e.leaderboard()[0].score, out.result.score);
  assert.equal(e.leaderboard()[0].name, 'Sara A.');
  assert.throws(() => e.answer(r.roundId, 0), /round_not_found/, 'finished round cannot be replayed');
});

test('timeouts score zero and elapsed time is capped', () => {
  const now = clock();
  const e = createEngine({ bank, now });
  const r = e.startRound(reg(e).id, 'password');
  now.tick(999999);
  const out = e.answer(r.roundId, null);
  assert.equal(out.correct, false);
  assert.equal(out.points, 0);
});

test('replays keep only the best score per mode, and are limited per day', () => {
  const now = clock();
  const e = createEngine({ bank, now });
  const v = reg(e);
  const play = right => { const r = e.startRound(v.id, 'social'); let q = r.question, o; for (let i = 0; i < QUESTIONS_PER_ROUND; i++) { o = e.answer(r.roundId, right ? answerFor(q.id) : 99); q = o.question; } return o.result.score; };
  const best = play(true);
  play(false);
  assert.equal(e.leaderboard()[0].score, best);
  for (let i = 2; i < MAX_PLAYS_PER_MODE_PER_DAY; i++) play(false);
  assert.throws(() => e.startRound(v.id, 'social'), /play_limit/);
  now.tick(24 * 3600 * 1000);
  assert.ok(e.startRound(v.id, 'social').roundId, 'limit resets next day');
});

test('profile, certificate, CSV export and deletion', () => {
  const e = createEngine({ bank });
  const v = reg(e, { name: '=HYPERLINK("x")', consentMarketing: true });
  assert.throws(() => e.completeProfile(v.id, { email: 'nope' }), /email_invalid/);
  e.completeProfile(v.id, { email: 'sara@corp.sa', company: 'Corp, "Ltd"', jobTitle: 'CISO' });
  assert.throws(() => e.certificate(v.id), /no_plays/);
  const r = e.startRound(v.id, 'phish'); let q = r.question;
  for (let i = 0; i < QUESTIONS_PER_ROUND; i++) q = e.answer(r.roundId, 0).question;
  assert.equal(e.certificate(v.id).modes.length, 1);
  const csv = e.exportCsv();
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/, 'formula injection neutralised');
  assert.match(csv, /"Corp, ""Ltd"""/);
  assert.match(csv, /,yes,/);
  assert.equal(e.stats().plays, 1);
  e.deleteVisitor(v.id);
  assert.equal(e.stats().visitors, 0);
  assert.equal(e.stats().plays, 0);
  assert.equal(e.leaderboard().length, 0);
});
