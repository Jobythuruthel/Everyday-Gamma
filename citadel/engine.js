// CITADEL game engine: storage, rounds and scoring.
// The server is the only place a score is calculated. The browser sends choices, never points.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const QUESTIONS_PER_ROUND = 5;
export const MAX_PLAYS_PER_MODE_PER_DAY = 3;
export const BASE_POINTS = 100;
const ROUND_TTL_MS = 10 * 60 * 1000;

export function score({ correct, difficulty, elapsedMs, timeLimitMs }) {
  if (!correct) return 0;
  const speed = Math.max(0.1, 1 - elapsedMs / timeLimitMs);
  return Math.round(BASE_POINTS * difficulty * speed);
}

export function createEngine({ dbPath = ':memory:', bank, now = () => Date.now() } = {}) {
  bank ??= JSON.parse(readFileSync(new URL('./questions.json', import.meta.url), 'utf8'));
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS visitors (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, mobile TEXT NOT NULL,
      email TEXT, company TEXT, job_title TEXT, lang TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS consents (
      id INTEGER PRIMARY KEY AUTOINCREMENT, visitor_id TEXT NOT NULL, purpose TEXT NOT NULL,
      granted INTEGER NOT NULL, lang TEXT, screen TEXT, at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS plays (
      id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, mode TEXT NOT NULL, score INTEGER NOT NULL,
      correct INTEGER NOT NULL, total INTEGER NOT NULL, duration_ms INTEGER NOT NULL,
      day TEXT NOT NULL, at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS answers (
      play_id TEXT NOT NULL, question_id TEXT NOT NULL, choice INTEGER, correct INTEGER NOT NULL,
      elapsed_ms INTEGER NOT NULL, points INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS plays_day ON plays(day, visitor_id);
  `);

  const rounds = new Map();
  const day = () => new Date(now()).toISOString().slice(0, 10);
  const clean = (s, max = 80) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

  function registerVisitor({ name, mobile, lang = 'en', consentGame, consentMarketing }) {
    name = clean(name, 60);
    mobile = clean(mobile, 20).replace(/[^\d+]/g, '');
    if (name.length < 2) throw httpError(400, 'name_required');
    if (mobile.replace(/\D/g, '').length < 7) throw httpError(400, 'mobile_invalid');
    if (consentGame !== true) throw httpError(400, 'consent_required');
    lang = lang === 'ar' ? 'ar' : 'en';
    const id = randomUUID();
    const t = now();
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO visitors (id, name, mobile, lang, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, mobile, lang, t);
      const c = db.prepare('INSERT INTO consents (visitor_id, purpose, granted, lang, screen, at) VALUES (?, ?, ?, ?, ?, ?)');
      c.run(id, 'game', 1, lang, 'identify', t);
      c.run(id, 'marketing', consentMarketing === true ? 1 : 0, lang, 'identify', t);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { id, name };
  }

  function completeProfile(visitorId, { email, company, jobTitle }) {
    const v = getVisitor(visitorId);
    email = clean(email, 120);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'email_invalid');
    db.prepare('UPDATE visitors SET email = ?, company = ?, job_title = ? WHERE id = ?')
      .run(email || null, clean(company) || null, clean(jobTitle) || null, v.id);
    return getVisitor(v.id);
  }

  function getVisitor(id) {
    const v = db.prepare('SELECT * FROM visitors WHERE id = ?').get(String(id));
    if (!v) throw httpError(404, 'visitor_not_found');
    return v;
  }

  function publicQuestion(q, lang) {
    return { id: q.id, prompt: q.prompt[lang], options: q.options.map(o => o[lang]) };
  }

  function pickQuestions(mode) {
    // Easy first, harder later; shuffled inside each difficulty so repeat players see new order.
    const shuffled = [...bank.modes[mode].questions].sort(() => Math.random() - 0.5);
    return shuffled.sort((a, b) => a.difficulty - b.difficulty).slice(0, QUESTIONS_PER_ROUND);
  }

  function startRound(visitorId, mode) {
    const v = getVisitor(visitorId);
    if (!bank.modes[mode]) throw httpError(400, 'unknown_mode');
    const played = db.prepare('SELECT COUNT(*) AS n FROM plays WHERE visitor_id = ? AND mode = ? AND day = ?').get(v.id, mode, day()).n;
    if (played >= MAX_PLAYS_PER_MODE_PER_DAY) throw httpError(429, 'play_limit');
    for (const [id, r] of rounds) if (now() - r.startedAt > ROUND_TTL_MS) rounds.delete(id);
    const r = {
      id: randomUUID(), visitorId: v.id, mode, lang: v.lang, questions: pickQuestions(mode),
      idx: 0, servedAt: now(), startedAt: now(), answers: [], score: 0
    };
    rounds.set(r.id, r);
    const m = bank.modes[mode];
    return {
      roundId: r.id, mode, title: m.title[r.lang], timeLimitMs: m.timeLimitMs,
      total: r.questions.length, index: 0, question: publicQuestion(r.questions[0], r.lang)
    };
  }

  function answer(roundId, choice) {
    const r = rounds.get(String(roundId));
    if (!r) throw httpError(404, 'round_not_found');
    const m = bank.modes[r.mode];
    const q = r.questions[r.idx];
    const elapsedMs = Math.min(now() - r.servedAt, m.timeLimitMs);
    const timedOut = choice === null || choice === undefined;
    const correct = !timedOut && Number(choice) === q.answer;
    const points = score({ correct, difficulty: q.difficulty, elapsedMs, timeLimitMs: m.timeLimitMs });
    r.answers.push({ questionId: q.id, choice: timedOut ? null : Number(choice), correct, elapsedMs, points });
    r.score += points;
    r.idx += 1;
    r.servedAt = now();
    const feedback = { correct, points, answer: q.answer, why: q.why[r.lang], score: r.score };
    if (r.idx < r.questions.length) {
      return { ...feedback, done: false, index: r.idx, question: publicQuestion(r.questions[r.idx], r.lang) };
    }
    rounds.delete(r.id);
    return { ...feedback, done: true, result: savePlay(r) };
  }

  function savePlay(r) {
    const playId = randomUUID();
    const correct = r.answers.filter(a => a.correct).length;
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO plays (id, visitor_id, mode, score, correct, total, duration_ms, day, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(playId, r.visitorId, r.mode, r.score, correct, r.answers.length, now() - r.startedAt, day(), now());
      const ins = db.prepare('INSERT INTO answers (play_id, question_id, choice, correct, elapsed_ms, points) VALUES (?, ?, ?, ?, ?, ?)');
      for (const a of r.answers) ins.run(playId, a.questionId, a.choice, a.correct ? 1 : 0, a.elapsedMs, a.points);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    const board = leaderboard();
    const rank = board.findIndex(b => b.visitorId === r.visitorId) + 1;
    return { playId, mode: r.mode, score: r.score, correct, total: r.answers.length, rank: rank || null };
  }

  // Daily board: each visitor's best score per mode, summed. Replays can only improve, never stack.
  function leaderboard(limit = 10) {
    return db.prepare(`
      SELECT v.id AS visitorId, v.name AS name, SUM(best) AS score FROM (
        SELECT visitor_id, mode, MAX(score) AS best FROM plays WHERE day = ? GROUP BY visitor_id, mode
      ) b JOIN visitors v ON v.id = b.visitor_id
      GROUP BY v.id ORDER BY score DESC, MIN(v.created_at) ASC LIMIT ?
    `).all(day(), limit).map(row => ({ ...row, name: displayName(row.name) }));
  }

  function certificate(visitorId) {
    const v = getVisitor(visitorId);
    const modes = db.prepare('SELECT mode, MAX(score) AS best FROM plays WHERE visitor_id = ? GROUP BY mode').all(v.id);
    if (!modes.length) throw httpError(404, 'no_plays');
    return { name: v.name, lang: v.lang, modes, total: modes.reduce((s, m) => s + m.best, 0), issuedAt: now() };
  }

  function stats() {
    return {
      visitors: db.prepare('SELECT COUNT(*) AS n FROM visitors').get().n,
      plays: db.prepare('SELECT COUNT(*) AS n FROM plays').get().n,
      marketingOptIns: db.prepare("SELECT COUNT(*) AS n FROM consents WHERE purpose = 'marketing' AND granted = 1").get().n,
      avgDurationMs: Math.round(db.prepare('SELECT AVG(duration_ms) AS a FROM plays').get().a || 0),
      mostMissed: db.prepare(`
        SELECT question_id AS questionId, COUNT(*) AS asked, SUM(1 - correct) AS missed
        FROM answers GROUP BY question_id ORDER BY missed * 1.0 / asked DESC, asked DESC LIMIT 5
      `).all()
    };
  }

  function exportCsv() {
    const rows = db.prepare(`
      SELECT v.id, v.name, v.mobile, v.email, v.company, v.job_title, v.lang, v.created_at,
        (SELECT granted FROM consents c WHERE c.visitor_id = v.id AND purpose = 'marketing' ORDER BY at DESC LIMIT 1) AS marketing,
        (SELECT COALESCE(SUM(score), 0) FROM plays p WHERE p.visitor_id = v.id) AS total_score,
        (SELECT COUNT(*) FROM plays p WHERE p.visitor_id = v.id) AS plays
      FROM visitors v ORDER BY v.created_at
    `).all();
    const head = ['id', 'name', 'mobile', 'email', 'company', 'job_title', 'lang', 'registered_at', 'marketing_consent', 'total_score', 'plays'];
    const cell = x => {
      let s = x === null || x === undefined ? '' : String(x);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map(r => [r.id, r.name, r.mobile, r.email, r.company, r.job_title, r.lang,
      new Date(r.created_at).toISOString(), r.marketing ? 'yes' : 'no', r.total_score, r.plays].map(cell).join(','));
    return '﻿' + [head.join(','), ...lines].join('\r\n') + '\r\n';
  }

  function deleteVisitor(visitorId) {
    getVisitor(visitorId);
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM answers WHERE play_id IN (SELECT id FROM plays WHERE visitor_id = ?)').run(visitorId);
      for (const t of ['plays', 'consents']) db.prepare(`DELETE FROM ${t} WHERE visitor_id = ?`).run(visitorId);
      db.prepare('DELETE FROM visitors WHERE id = ?').run(visitorId);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    for (const [id, r] of rounds) if (r.visitorId === visitorId) rounds.delete(id);
    return { deleted: true };
  }

  function modes(lang = 'en') {
    lang = lang === 'ar' ? 'ar' : 'en';
    return Object.entries(bank.modes).map(([id, m]) => ({ id, title: m.title[lang], intro: m.intro[lang], timeLimitMs: m.timeLimitMs }));
  }

  return { registerVisitor, completeProfile, getVisitor, startRound, answer, leaderboard, certificate, stats, exportCsv, deleteVisitor, modes, close: () => db.close() };
}

function displayName(name) {
  const parts = name.split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

export function httpError(status, code) {
  return Object.assign(new Error(code), { status, code });
}
