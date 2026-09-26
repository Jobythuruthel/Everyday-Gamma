// AEGIS engine: storage, rounds and scoring for four safety modules.
// The browser gets what it needs to draw a round, never the answers. Scores are calculated here.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const MODULES = ['hazard', 'loto', 'ppe', 'reaction'];
const ROUND_TTL_MS = 10 * 60 * 1000;

export function httpError(status, code) {
  return Object.assign(new Error(code), { status, code });
}

const shuffle = arr => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// Pure scoring functions, exported for tests.
export function scoreHazard(scene, { tapped = [], emptyTaps = 0, elapsedMs }, timeLimitMs) {
  const byId = new Map(scene.elements.map(e => [e.id, e]));
  const ids = [...new Set(tapped.map(String))].filter(id => byId.has(id));
  const found = ids.filter(id => byId.get(id).hazard);
  const wrong = ids.filter(id => !byId.get(id).hazard);
  const hazards = scene.elements.filter(e => e.hazard);
  let points = found.reduce((s, id) => s + 100 * byId.get(id).severity, 0);
  points -= wrong.length * 50 + Math.min(50, Math.max(0, Number(emptyTaps) || 0)) * 10;
  if (found.length === hazards.length) points += Math.round(200 * Math.max(0, 1 - elapsedMs / timeLimitMs));
  return {
    score: Math.max(0, points), correct: found.length, total: hazards.length,
    missed: hazards.filter(h => !found.includes(h.id)).map(h => h.id), wrong
  };
}

export function scoreLoto(steps, order) {
  const want = steps.map(s => s.id);
  if (!Array.isArray(order) || order.length !== want.length || new Set(order).size !== want.length || !order.every(id => want.includes(id))) {
    throw httpError(400, 'order_invalid');
  }
  const correct = order.filter((id, i) => id === want[i]).length;
  return { score: correct * 100 + (correct === want.length ? 200 : 0), correct, total: want.length, answer: want };
}

export function scorePpe(tasks, selections = {}) {
  let score = 0, correct = 0;
  const detail = tasks.map(t => {
    const picked = new Set((selections[t.id] ?? []).map(String));
    const right = t.required.filter(id => picked.has(id)).length;
    const extra = [...picked].filter(id => !t.required.includes(id)).length;
    const perfect = right === t.required.length && extra === 0;
    score += right * 100 - extra * 50 + (perfect ? 100 : 0);
    if (perfect) correct++;
    return { task: t.id, required: t.required, perfect };
  });
  return { score: Math.max(0, score), correct, total: tasks.length, detail };
}

export function scoreReaction(cfg, trials) {
  if (!Array.isArray(trials) || trials.length !== cfg.trials) throw httpError(400, 'trials_invalid');
  const clean = trials.map(ms => {
    ms = Number(ms);
    return Number.isFinite(ms) && ms >= cfg.minMs && ms <= cfg.maxMs ? Math.round(ms) : null; // null = false start or no reaction
  });
  const valid = clean.filter(ms => ms !== null);
  return {
    score: valid.reduce((s, ms) => s + Math.round((cfg.maxMs - ms) / 4), 0),
    correct: valid.length, total: cfg.trials,
    avgMs: valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null
  };
}

export function createEngine({ dbPath = ':memory:', content, now = () => Date.now() } = {}) {
  content ??= JSON.parse(readFileSync(new URL('./content.json', import.meta.url), 'utf8'));
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS visitors (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, employee_no TEXT, department TEXT, lang TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS plays (
      id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL, module TEXT NOT NULL, variant TEXT, score INTEGER NOT NULL,
      correct INTEGER NOT NULL, total INTEGER NOT NULL, detail TEXT, duration_ms INTEGER NOT NULL, day TEXT NOT NULL, at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS plays_visitor ON plays(visitor_id, module);
  `);

  const rounds = new Map();
  const day = () => new Date(now()).toISOString().slice(0, 10);
  const clean = (s, max = 60) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
  const L = lang => (lang === 'ar' ? 'ar' : 'en');

  function registerVisitor({ name, employeeNo, department, lang }) {
    name = clean(name);
    if (name.length < 2) throw httpError(400, 'name_required');
    const id = randomUUID();
    db.prepare('INSERT INTO visitors (id, name, employee_no, department, lang, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, name, clean(employeeNo, 30) || null, clean(department) || null, L(lang), now());
    return { id, name };
  }

  function getVisitor(id) {
    const v = db.prepare('SELECT * FROM visitors WHERE id = ?').get(String(id));
    if (!v) throw httpError(404, 'visitor_not_found');
    return v;
  }

  function startRound(visitorId, module) {
    const v = getVisitor(visitorId);
    if (!MODULES.includes(module)) throw httpError(400, 'unknown_module');
    for (const [id, r] of rounds) if (now() - r.startedAt > ROUND_TTL_MS) rounds.delete(id);
    const lang = v.lang;
    const r = { id: randomUUID(), visitorId: v.id, module, startedAt: now() };
    let payload;
    if (module === 'hazard') {
      const scene = content.hazard.scenes[Math.floor(Math.random() * content.hazard.scenes.length)];
      r.scene = scene;
      payload = {
        timeLimitMs: content.hazard.timeLimitMs, sceneId: scene.id, title: scene.title[lang],
        hazards: scene.elements.filter(e => e.hazard).length,
        elements: scene.elements.map(({ id, kind, variant, x, y }) => ({ id, kind, variant, x, y }))
      };
    } else if (module === 'loto') {
      let steps = shuffle(content.loto.steps);
      while (steps.every((s, i) => s.id === content.loto.steps[i].id)) steps = shuffle(content.loto.steps);
      payload = { timeLimitMs: content.loto.timeLimitMs, steps: steps.map(s => ({ id: s.id, label: s.label[lang] })) };
    } else if (module === 'ppe') {
      payload = {
        timeLimitMs: content.ppe.timeLimitMs,
        items: content.ppe.items.map(i => ({ id: i.id, label: i.label[lang] })),
        tasks: content.ppe.tasks.map(t => ({ id: t.id, label: t.label[lang] }))
      };
    } else {
      const delays = Array.from({ length: content.reaction.trials }, () => 1500 + Math.floor(Math.random() * 2500));
      r.minDurationMs = delays.reduce((a, b) => a + b, 0);
      payload = { delays, maxMs: content.reaction.maxMs };
    }
    rounds.set(r.id, r);
    return { roundId: r.id, module, ...payload };
  }

  function submit(roundId, input = {}) {
    const r = rounds.get(String(roundId));
    if (!r) throw httpError(404, 'round_not_found');
    const elapsedMs = now() - r.startedAt;
    let result;
    if (r.module === 'hazard') result = scoreHazard(r.scene, { ...input, elapsedMs }, content.hazard.timeLimitMs);
    else if (r.module === 'loto') result = scoreLoto(content.loto.steps, input.order);
    else if (r.module === 'ppe') result = scorePpe(content.ppe.tasks, input.selections);
    else {
      result = scoreReaction(content.reaction, input.trials);
      if (elapsedMs < r.minDurationMs) result = { ...result, score: 0, correct: 0, avgMs: null }; // finished faster than the sirens could sound
    }
    rounds.delete(r.id);
    const lang = getVisitor(r.visitorId).lang;
    const playId = randomUUID();
    db.prepare('INSERT INTO plays (id, visitor_id, module, variant, score, correct, total, detail, duration_ms, day, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(playId, r.visitorId, r.module, r.scene?.id ?? null, result.score, result.correct, result.total, JSON.stringify(result), elapsedMs, day(), now());
    return { playId, module: r.module, ...result, feedback: feedback(r, result, lang) };
  }

  function feedback(r, result, lang) {
    if (r.module === 'hazard') return result.missed.map(id => r.scene.elements.find(e => e.id === id).label[lang]);
    if (r.module === 'loto') return result.answer.map(id => content.loto.steps.find(s => s.id === id).label[lang]);
    if (r.module === 'ppe') {
      return result.detail.map(d => {
        const t = content.ppe.tasks.find(x => x.id === d.task);
        return `${t.label[lang]}: ${d.required.map(id => content.ppe.items.find(i => i.id === id).label[lang]).join(', ')}`;
      });
    }
    return [];
  }

  function best(visitorId) {
    return db.prepare('SELECT module, MAX(score) AS best FROM plays WHERE visitor_id = ? GROUP BY module').all(visitorId);
  }

  function leaderboard(limit = 10) {
    return db.prepare(`
      SELECT v.id AS visitorId, v.name AS name, SUM(best) AS score FROM (
        SELECT visitor_id, module, MAX(score) AS best FROM plays WHERE day = ? GROUP BY visitor_id, module
      ) b JOIN visitors v ON v.id = b.visitor_id GROUP BY v.id ORDER BY score DESC, MIN(v.created_at) ASC LIMIT ?
    `).all(day(), limit).map(row => ({ ...row, name: displayName(row.name) }));
  }

  function certificate(visitorId) {
    const v = getVisitor(visitorId);
    const modules = best(v.id);
    if (!modules.length) throw httpError(404, 'no_plays');
    return { name: v.name, employeeNo: v.employee_no, lang: v.lang, modules, complete: modules.length === MODULES.length, total: modules.reduce((s, m) => s + m.best, 0), issuedAt: now() };
  }

  function stats() {
    const missed = new Map();
    for (const row of db.prepare("SELECT detail FROM plays WHERE module = 'hazard'").all()) {
      for (const id of JSON.parse(row.detail).missed) missed.set(id, (missed.get(id) ?? 0) + 1);
    }
    const labels = new Map(content.hazard.scenes.flatMap(s => s.elements).map(e => [e.id, e.label?.en]));
    return {
      visitors: db.prepare('SELECT COUNT(*) AS n FROM visitors').get().n,
      plays: db.prepare('SELECT COUNT(*) AS n FROM plays').get().n,
      certified: db.prepare(`SELECT COUNT(*) AS n FROM (SELECT visitor_id FROM plays GROUP BY visitor_id HAVING COUNT(DISTINCT module) = ${MODULES.length})`).get().n,
      byModule: db.prepare('SELECT module, COUNT(*) AS plays, ROUND(AVG(score)) AS avgScore, ROUND(AVG(correct * 100.0 / total)) AS avgPct FROM plays GROUP BY module').all(),
      avgReactionMs: (() => {
        const rows = db.prepare("SELECT detail FROM plays WHERE module = 'reaction'").all().map(r => JSON.parse(r.detail).avgMs).filter(Boolean);
        return rows.length ? Math.round(rows.reduce((a, b) => a + b, 0) / rows.length) : null;
      })(),
      mostMissedHazards: [...missed].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ id, label: labels.get(id), missed: n }))
    };
  }

  function exportCsv() {
    const rows = db.prepare(`
      SELECT v.id, v.name, v.employee_no, v.department, v.lang, v.created_at,
        (SELECT COUNT(DISTINCT module) FROM plays p WHERE p.visitor_id = v.id) AS modules,
        (SELECT COALESCE(SUM(b), 0) FROM (SELECT MAX(score) AS b FROM plays p WHERE p.visitor_id = v.id GROUP BY module)) AS total
      FROM visitors v ORDER BY v.created_at
    `).all();
    const head = ['id', 'name', 'employee_no', 'department', 'lang', 'registered_at', 'modules_done', 'certified', 'total_score'];
    const cell = x => {
      let s = x === null || x === undefined ? '' : String(x);
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map(r => [r.id, r.name, r.employee_no, r.department, r.lang, new Date(r.created_at).toISOString(),
      r.modules, r.modules === MODULES.length ? 'yes' : 'no', r.total].map(cell).join(','));
    return '﻿' + [head.join(','), ...lines].join('\r\n') + '\r\n';
  }

  function deleteVisitor(visitorId) {
    getVisitor(visitorId);
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM plays WHERE visitor_id = ?').run(visitorId);
      db.prepare('DELETE FROM visitors WHERE id = ?').run(visitorId);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    for (const [id, r] of rounds) if (r.visitorId === visitorId) rounds.delete(id);
    return { deleted: true };
  }

  return { registerVisitor, getVisitor, startRound, submit, best, leaderboard, certificate, stats, exportCsv, deleteVisitor, close: () => db.close() };
}

function displayName(name) {
  const parts = name.split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}
