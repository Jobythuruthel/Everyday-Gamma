// Acceptance: zero wrong answers on 100 questions (70 answerable, 30 trick).
// A refusal on an answerable question is allowed but counted; answering the wrong entry or answering a trick question fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEngine } from '../engine.js';

const evalSet = JSON.parse(readFileSync(new URL('./eval.json', import.meta.url), 'utf8'));

test('eval set: 100 questions, 30 of them trick questions', () => {
  assert.equal(evalSet.answerable.length + evalSet.trick.length, 100);
  assert.equal(evalSet.trick.length, 30);
});

test('zero invented or wrong answers, and at least 90% of answerable questions answered', () => {
  const e = createEngine();
  const wrong = [], refused = [];
  for (const [q, want] of evalSet.answerable) {
    const r = e.ask({ text: q, lang: /[؀-ۿ]/.test(q) ? 'ar' : 'en' });
    if (r.action === 'answer' && r.entryId !== want) wrong.push(`${q} -> ${r.entryId} (want ${want})`);
    if (r.action !== 'answer') refused.push(q);
  }
  for (const q of evalSet.trick) {
    const r = e.ask({ text: q, lang: /[؀-ۿ]/.test(q) ? 'ar' : 'en' });
    if (r.action === 'answer') wrong.push(`TRICK answered: ${q} -> ${r.entryId}`);
  }
  const rate = 1 - refused.length / evalSet.answerable.length;
  console.log(`answer rate ${(rate * 100).toFixed(0)}%, refused: ${JSON.stringify(refused)}`);
  assert.deepEqual(wrong, []);
  assert.ok(rate >= 0.9, `answer rate ${rate}`);
});
