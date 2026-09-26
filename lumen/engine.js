// LUMEN engine: guest list for named greetings, and visit analytics (approaches, greetings, dwell).
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export function httpError(status, code) {
  return Object.assign(new Error(code), { status, code });
}

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  text = String(text).replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(f => f.trim())) rows.push(row);
  return rows;
}

const ZONE_RANK = { empty: 0, passing: 1, attention: 2, interaction: 3 };

export function createEngine({ dbPath = ':memory:', now = () => Date.now() } = {}) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS guests (code TEXT PRIMARY KEY, name TEXT NOT NULL, title TEXT, lang TEXT);
    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY, max_zone TEXT NOT NULL, greeted INTEGER NOT NULL, named INTEGER NOT NULL,
      questions INTEGER NOT NULL, dwell_ms INTEGER NOT NULL, lang TEXT, at INTEGER NOT NULL
    );
  `);
  const clean = (s, max = 60) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
  const normCode = c => String(c ?? '').trim().toUpperCase().replace(/\s+/g, '');

  function importGuests(text) {
    const rows = parseCsv(text);
    if (rows.length < 2) throw httpError(400, 'csv_empty');
    const head = rows[0].map(h => h.trim().toLowerCase());
    const col = n => head.indexOf(n);
    if (col('code') < 0 || col('name') < 0) throw httpError(400, 'csv_needs_code_and_name');
    let imported = 0;
    const errors = [];
    const up = db.prepare('INSERT INTO guests (code, name, title, lang) VALUES (?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET name = excluded.name, title = excluded.title, lang = excluded.lang');
    db.exec('BEGIN');
    try {
      rows.slice(1).forEach((r, i) => {
        const code = normCode(r[col('code')]), name = clean(r[col('name')]);
        if (!code || name.length < 2) return errors.push(`row ${i + 2}: needs code and name`);
        const lang = col('lang') >= 0 && String(r[col('lang')]).trim().toLowerCase() === 'ar' ? 'ar' : 'en';
        up.run(code, name, col('title') >= 0 ? clean(r[col('title')]) || null : null, lang);
        imported++;
      });
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { imported, errors };
  }

  function guest(code) {
    const g = db.prepare('SELECT code, name, title, lang FROM guests WHERE code = ?').get(normCode(code));
    if (!g) throw httpError(404, 'guest_not_found');
    // Greet by first name only: friendlier out loud, and less personal data spoken in a public space.
    return { name: g.name.split(/\s+/)[0], title: g.title, lang: g.lang };
  }

  function logVisit({ maxZone, greeted, named, questions, dwellMs, lang }) {
    if (!(maxZone in ZONE_RANK) || maxZone === 'empty') throw httpError(400, 'zone_invalid');
    const dwell = Math.max(0, Math.min(Number(dwellMs) || 0, 30 * 60000));
    db.prepare('INSERT INTO visits (id, max_zone, greeted, named, questions, dwell_ms, lang, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), maxZone, greeted ? 1 : 0, named ? 1 : 0, Math.max(0, Math.min(Number(questions) || 0, 50)), Math.round(dwell), lang === 'ar' ? 'ar' : 'en', now());
    return { ok: true };
  }

  function stats() {
    const one = (sql, ...a) => db.prepare(sql).get(...a).n;
    const approaches = one("SELECT COUNT(*) AS n FROM visits WHERE max_zone IN ('attention', 'interaction')");
    const greeted = one('SELECT COUNT(*) AS n FROM visits WHERE greeted = 1');
    return {
      passersBy: one('SELECT COUNT(*) AS n FROM visits'),
      approaches,
      interactions: one("SELECT COUNT(*) AS n FROM visits WHERE max_zone = 'interaction'"),
      greeted,
      namedGreetings: one('SELECT COUNT(*) AS n FROM visits WHERE named = 1'),
      questions: one('SELECT COALESCE(SUM(questions), 0) AS n FROM visits'),
      approachRate: one('SELECT COUNT(*) AS n FROM visits') ? Math.round(100 * approaches / one('SELECT COUNT(*) AS n FROM visits')) : null,
      avgDwellSec: Math.round((db.prepare("SELECT AVG(dwell_ms) AS a FROM visits WHERE max_zone IN ('attention', 'interaction')").get().a || 0) / 100) / 10,
      lastHour: one('SELECT COUNT(*) AS n FROM visits WHERE at > ?', now() - 3600000),
      guests: one('SELECT COUNT(*) AS n FROM guests')
    };
  }

  return { importGuests, guest, logVisit, stats, close: () => db.close() };
}
