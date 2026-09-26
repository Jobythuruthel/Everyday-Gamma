import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEngine, tokenize } from '../engine.js';

const kb = JSON.parse(readFileSync(new URL('../knowledge.json', import.meta.url), 'utf8'));

test('knowledge base: every entry has EN and AR questions, answers and a source', () => {
  for (const e of kb.entries) {
    assert.ok(e.q.en?.length && e.q.ar?.length, e.id);
    assert.ok(e.a.en && e.a.ar && e.source, e.id);
  }
  assert.equal(new Set(kb.entries.map(e => e.id)).size, kb.entries.length);
});

test('tokenizer: stopwords, plurals, Arabic normalisation and prefixes, Arabic digits', () => {
  assert.deepEqual(tokenize('Where are the Toilets?'), ['toilet']);
  assert.deepEqual(tokenize('أين الإسعافات'), tokenize('اين اسعافات'));
  assert.deepEqual(tokenize('وين المصلى'), ['مصلي']);
  assert.deepEqual(tokenize('wi-fi'), ['wifi']);
  assert.deepEqual(tokenize('١٠:٠٠'), ['10', '00']);
});

test('answers are returned word for word from the approved entry, with source', () => {
  const e = createEngine({ knowledge: kb });
  const r = e.ask({ text: 'What time does the opening keynote start?', lang: 'en' });
  const entry = kb.entries.find(x => x.id === 'keynote');
  assert.equal(r.action, 'answer');
  assert.equal(r.answer, entry.a.en);
  assert.equal(r.source, entry.source);
  assert.equal(e.ask({ text: 'متى الكلمة الرئيسية؟', lang: 'ar' }).answer, entry.a.ar);
});

test('refusals and clarifications are logged as unanswered, answers are not', () => {
  const e = createEngine({ knowledge: kb });
  e.ask({ text: 'Where is the helipad?', lang: 'en' });
  e.ask({ text: 'where is the helipad', lang: 'en' });
  e.ask({ text: 'wifi', lang: 'en' });
  const u = e.unanswered();
  assert.equal(u.length, 1);
  assert.equal(u[0].times, 2);
  assert.throws(() => e.ask({ text: '   ' }), /empty_question/);
});

test('staff-added answers become answerable immediately and can be removed', () => {
  const e = createEngine({ knowledge: kb });
  assert.notEqual(e.ask({ text: 'Where is the helipad?' }).action, 'answer');
  const { id } = e.addEntry({ question: 'Where is the helipad?', answer: 'The helipad is on the roof of Tower 2.', lang: 'en', source: 'Organiser' });
  const r = e.ask({ text: 'helipad location', lang: 'en' });
  assert.equal(r.action, 'answer');
  assert.equal(r.answer, 'The helipad is on the roof of Tower 2.');
  assert.equal(r.source, 'Organiser');
  e.removeEntry(id);
  assert.notEqual(e.ask({ text: 'helipad location' }).action, 'answer');
  assert.throws(() => e.addEntry({ question: 'x', answer: 'y' }), /entry_invalid/);
});

test('an English-only staff answer falls back to English for an Arabic visitor', () => {
  const e = createEngine({ knowledge: kb });
  e.addEntry({ question: 'Where is the helipad?', answer: 'Roof of Tower 2.', lang: 'en' });
  assert.equal(e.ask({ text: 'helipad', lang: 'ar' }).answer, 'Roof of Tower 2.');
});

test('handoffs, trending, suggestions and stats', () => {
  const e = createEngine({ knowledge: kb });
  for (let i = 0; i < 3; i++) e.ask({ text: 'where is the prayer room', lang: 'en', via: 'voice' });
  assert.equal(e.trending('en')[0].entryId, 'prayer');
  assert.equal(e.trending('ar').length, 4);
  assert.equal(e.entry('wifi', 'ar').answer, kb.entries.find(x => x.id === 'wifi').a.ar);
  const { id } = e.requestHandoff({ question: 'helipad?', lang: 'en' });
  assert.equal(e.handoffs().length, 1);
  assert.equal(e.stats().handoffsOpen, 1);
  e.resolveHandoff(id);
  assert.throws(() => e.resolveHandoff(id), /handoff_not_found/);
  const s = e.stats();
  assert.equal(s.voice, 3);
  assert.equal(s.answerRate, 100);
  assert.equal(s.handoffsOpen, 0);
});
