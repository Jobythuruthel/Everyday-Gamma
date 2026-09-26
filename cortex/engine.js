// CORTEX engine: approved-answers retrieval with a strict refusal gate.
// It never writes an answer. It returns an approved answer word for word, with its source, or it refuses.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const GATE = { maxUnknownRatio: 0.34, minCoverage: 0.5, ambiguityMargin: 0.08 };

const STOP_EN = new Set(('a an the is are am was were be been do does did can could would should will shall may might must i me my mine we us our you your he she it they them their there here this that these those ' +
  'what where when who whom which why how of in on at to for from by with about into over under and or but if so not no yes please tell show know want wanted need get find go going like ' +
  'hi hello hey thanks thank okay ok any some anyone somebody place today now kind let give time held located happen happening take whats').split(' '));
const STOP_AR = new Set(('في من الى إلى على عن مع هل ما ماذا متى اين أين كيف لماذا من هو هي انا أنا نحن انت أنت هذا هذه ذلك تلك هناك هنا او أو و ثم لا نعم يوجد توجد ' +
  'اريد أريد ممكن يمكن يمكنني يمكنك استطيع أستطيع اعرف أعرف لو فضلك رجاء كم اي أي الذي التي عند بعد قبل كل شي شيء اليوم الان الآن مرحبا شكرا وين فين شو ايش وش احتاج ابي ابغى').split(' ').map(normAr));

function normAr(s) {
  return s.replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
}

export function tokenize(text) {
  const words = normAr(String(text).toLowerCase().replace(/wi-?fi/g, 'wifi'))
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/['’]s\b/g, '')
    .split(/[^a-z0-9ء-ي]+/)
    .filter(Boolean);
  const out = [];
  for (let w of words) {
    if (/[ء-ي]/.test(w)) {
      if (STOP_AR.has(w)) continue;
      w = w.replace(/^(و|ف|ب|ك|ل)?ال(?=..)/, '').replace(/^لل(?=..)/, '');
      if (STOP_AR.has(w)) continue;
    } else {
      if (STOP_EN.has(w)) continue;
      if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    }
    if (w.length >= 2) out.push(w);
  }
  return out;
}

// BM25 over entries. Question variants count fully; answer text counts at half weight.
export function buildIndex(entries) {
  const docs = entries.map(e => {
    const tf = new Map();
    const add = (text, w) => { for (const tok of tokenize(text)) tf.set(tok, (tf.get(tok) ?? 0) + w); };
    for (const lang of ['en', 'ar']) {
      for (const q of e.q[lang] ?? []) add(q, 1);
      for (const k of e.keywords?.[lang] ?? []) add(k, 1);
      if (e.a[lang]) add(e.a[lang], 0.5);
    }
    const len = [...tf.values()].reduce((a, b) => a + b, 0);
    return { entry: e, tf, len };
  });
  const df = new Map();
  for (const d of docs) for (const tok of d.tf.keys()) df.set(tok, (df.get(tok) ?? 0) + 1);
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
  return { docs, df, avgLen, vocab: new Set(df.keys()) };
}

export function retrieve(index, query, gate = GATE) {
  const qTokens = [...new Set(tokenize(query))];
  if (!qTokens.length) return { action: 'refuse', reason: 'empty', qTokens };
  const unknown = qTokens.filter(t => !index.vocab.has(t));
  if (unknown.length / qTokens.length > gate.maxUnknownRatio) return { action: 'refuse', reason: 'unknown_terms', unknown, qTokens };
  const N = index.docs.length, k1 = 1.4, b = 0.75;
  // Coverage is weighted by rarity, so a distinctive word ("helipad") counts for more than a common one ("location").
  const idf = t => index.df.has(t) ? Math.log(1 + (N - index.df.get(t) + 0.5) / (index.df.get(t) + 0.5)) : 0;
  const totalIdf = qTokens.reduce((s, t) => s + idf(t), 0);
  const ranked = index.docs.map(d => {
    let score = 0, hitIdf = 0;
    for (const t of qTokens) {
      const f = d.tf.get(t);
      if (!f) continue;
      hitIdf += idf(t);
      score += idf(t) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / index.avgLen));
    }
    return { entry: d.entry, score, coverage: totalIdf ? hitIdf / totalIdf : 0 };
  }).filter(r => r.score > 0).sort((x, y) => y.score - x.score);
  const [top, second] = ranked;
  if (!top || top.coverage < gate.minCoverage) return { action: 'refuse', reason: 'low_coverage', qTokens, suggestions: ranked.slice(0, 2).map(r => r.entry.id) };
  // Ask instead of guessing when a second topic explains the question just as well.
  if (second && second.coverage >= top.coverage && (top.coverage < 1 || (top.score - second.score) / top.score < gate.ambiguityMargin)) {
    return { action: 'clarify', reason: 'ambiguous', qTokens, suggestions: [top.entry.id, second.entry.id] };
  }
  return { action: 'answer', entry: top.entry, score: top.score, coverage: top.coverage, qTokens };
}

export function httpError(status, code) {
  return Object.assign(new Error(code), { status, code });
}

export function createEngine({ dbPath = ':memory:', knowledge, now = () => Date.now() } = {}) {
  knowledge ??= JSON.parse(readFileSync(new URL('./knowledge.json', import.meta.url), 'utf8'));
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS custom_entries (id TEXT PRIMARY KEY, question TEXT NOT NULL, answer TEXT NOT NULL, lang TEXT NOT NULL, source TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, lang TEXT, action TEXT NOT NULL, entry_id TEXT, via TEXT, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS handoffs (id TEXT PRIMARY KEY, question TEXT, lang TEXT, status TEXT NOT NULL, at INTEGER NOT NULL, resolved_at INTEGER);
  `);
  const clean = (s, max = 300) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  const L = lang => (lang === 'ar' ? 'ar' : 'en');
  let index, byId;

  function entries() {
    const custom = db.prepare('SELECT * FROM custom_entries').all().map(c => ({
      id: c.id, source: c.source || 'Operator', custom: true,
      q: { [c.lang]: [c.question] }, a: { [c.lang]: c.answer }
    }));
    return [...knowledge.entries, ...custom];
  }
  function rebuild() {
    const all = entries();
    index = buildIndex(all);
    byId = new Map(all.map(e => [e.id, e]));
  }
  rebuild();

  function answerText(entry, lang) {
    return entry.a[lang] ?? entry.a[lang === 'ar' ? 'en' : 'ar'];
  }
  function label(entry, lang) {
    return (entry.q[lang] ?? entry.q.en ?? entry.q.ar)[0];
  }

  function ask({ text, lang, via = 'text' }) {
    text = clean(text);
    lang = L(lang);
    if (!text) throw httpError(400, 'empty_question');
    const r = retrieve(index, text);
    db.prepare('INSERT INTO questions (text, lang, action, entry_id, via, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(text, lang, r.action, r.entry?.id ?? null, via === 'voice' ? 'voice' : 'text', now());
    if (r.action === 'answer') return { action: 'answer', entryId: r.entry.id, answer: answerText(r.entry, lang), source: r.entry.source };
    const suggestions = (r.suggestions ?? []).map(id => ({ entryId: id, label: label(byId.get(id), lang) }));
    return { action: r.action, reason: r.reason, suggestions };
  }

  function entry(id, lang) {
    const e = byId.get(String(id));
    if (!e) throw httpError(404, 'entry_not_found');
    db.prepare('INSERT INTO questions (text, lang, action, entry_id, via, at) VALUES (?, ?, ?, ?, ?, ?)').run(label(e, L(lang)), L(lang), 'answer', e.id, 'suggestion', now());
    return { action: 'answer', entryId: e.id, answer: answerText(e, L(lang)), source: e.source };
  }

  function trending(lang, limit = 4) {
    lang = L(lang);
    const top = db.prepare("SELECT entry_id, COUNT(*) AS n FROM questions WHERE action = 'answer' GROUP BY entry_id ORDER BY n DESC LIMIT ?").all(limit)
      .map(r => byId.get(r.entry_id)).filter(Boolean);
    const fill = knowledge.entries.filter(e => !top.includes(e)).slice(0, limit - top.length);
    return [...top, ...fill].map(e => ({ entryId: e.id, label: label(e, lang) }));
  }

  function requestHandoff({ question, lang }) {
    const id = randomUUID();
    db.prepare('INSERT INTO handoffs (id, question, lang, status, at) VALUES (?, ?, ?, ?, ?)').run(id, clean(question) || null, L(lang), 'open', now());
    return { id };
  }
  function handoffs() {
    return db.prepare("SELECT * FROM handoffs WHERE status = 'open' ORDER BY at").all();
  }
  function resolveHandoff(id) {
    const r = db.prepare("UPDATE handoffs SET status = 'resolved', resolved_at = ? WHERE id = ? AND status = 'open'").run(now(), String(id));
    if (!r.changes) throw httpError(404, 'handoff_not_found');
    return { resolved: true };
  }

  // Groups questions that mean the same thing ("Where is the helipad?" and "where is the helipad").
  function unanswered(limit = 30) {
    const groups = new Map();
    for (const q of db.prepare("SELECT text, lang, at FROM questions WHERE action != 'answer' ORDER BY at DESC LIMIT 5000").all()) {
      const key = tokenize(q.text).sort().join(' ') || q.text.toLowerCase();
      const g = groups.get(key);
      if (g) g.times++;
      else groups.set(key, { text: q.text, lang: q.lang, times: 1, last: q.at });
    }
    return [...groups.values()].sort((a, b) => b.times - a.times || b.last - a.last).slice(0, limit);
  }

  function addEntry({ question, answer, lang, source }) {
    question = clean(question, 200); answer = clean(answer, 600);
    if (question.length < 3 || answer.length < 3) throw httpError(400, 'entry_invalid');
    const id = `custom-${randomUUID().slice(0, 8)}`;
    db.prepare('INSERT INTO custom_entries (id, question, answer, lang, source, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, question, answer, L(lang), clean(source, 60) || 'Operator', now());
    rebuild();
    return { id };
  }
  function removeEntry(id) {
    const r = db.prepare('DELETE FROM custom_entries WHERE id = ?').run(String(id));
    if (!r.changes) throw httpError(404, 'entry_not_found');
    rebuild();
    return { deleted: true };
  }
  function customEntries() {
    return db.prepare('SELECT * FROM custom_entries ORDER BY created_at DESC').all();
  }

  function stats() {
    const q = db.prepare("SELECT COUNT(*) AS total, SUM(action = 'answer') AS answered, SUM(via = 'voice') AS voice FROM questions").get();
    return {
      questions: q.total, answered: q.answered ?? 0, answerRate: q.total ? Math.round(100 * (q.answered ?? 0) / q.total) : null,
      voice: q.voice ?? 0,
      handoffsOpen: db.prepare("SELECT COUNT(*) AS n FROM handoffs WHERE status = 'open'").get().n,
      handoffsTotal: db.prepare('SELECT COUNT(*) AS n FROM handoffs').get().n,
      topTopics: db.prepare("SELECT entry_id AS entryId, COUNT(*) AS n FROM questions WHERE action = 'answer' GROUP BY entry_id ORDER BY n DESC LIMIT 5").all()
    };
  }

  return { ask, entry, trending, requestHandoff, handoffs, resolveHandoff, unanswered, addEntry, removeEntry, customEntries, stats, event: knowledge.event, close: () => db.close() };
}
