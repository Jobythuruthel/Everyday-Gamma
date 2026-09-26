// CONCIERGE engine: attendees, check-in, walk-ins, VIP alerts and a durable print queue.
// Every check-in is written to SQLite first; printing and host alerts retry in the background, so nothing is lost offline.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomInt } from 'node:crypto';
import { badgeZpl } from './printer.js';

export const CATEGORIES = ['ATTENDEE', 'VIP', 'SPEAKER', 'EXHIBITOR', 'MEDIA', 'STAFF'];
const MAX_ATTEMPTS = 5;

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

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
const normCode = c => String(c ?? '').trim().toUpperCase().replace(/\s+/g, '');
const normEmail = e => String(e ?? '').trim().toLowerCase();
const normMobile = m => String(m ?? '').replace(/\D/g, '');

export function createEngine({ dbPath = ':memory:', now = () => Date.now(), printerEnabled = false, webhookEnabled = false } = {}) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS attendees (
      id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, company TEXT, email TEXT, mobile TEXT,
      category TEXT NOT NULL, host_name TEXT, host_contact TEXT, source TEXT NOT NULL,
      checked_in_at INTEGER, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS attendees_email ON attendees(email);
    CREATE INDEX IF NOT EXISTS attendees_mobile ON attendees(mobile);
    CREATE TABLE IF NOT EXISTS print_jobs (
      id TEXT PRIMARY KEY, attendee_id TEXT NOT NULL, zpl TEXT NOT NULL, status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at INTEGER NOT NULL, done_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY, attendee_id TEXT NOT NULL, status TEXT NOT NULL, webhook TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, ack_at INTEGER
    );
  `);
  const clean = (s, max = 80) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
  const cat = c => (CATEGORIES.includes(String(c ?? '').trim().toUpperCase()) ? String(c).trim().toUpperCase() : 'ATTENDEE');
  const pub = a => ({ id: a.id, code: a.code, name: a.name, company: a.company, category: a.category, vip: a.category === 'VIP' });

  function importCsv(text) {
    const rows = parseCsv(text);
    if (rows.length < 2) throw httpError(400, 'csv_empty');
    const head = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const col = name => head.indexOf(name);
    if (col('name') < 0) throw httpError(400, 'csv_needs_name_column');
    let added = 0, updated = 0;
    const errors = [];
    const get = (r, n) => (col(n) >= 0 ? r[col(n)] : '');
    db.exec('BEGIN');
    try {
      rows.slice(1).forEach((r, i) => {
        const name = clean(get(r, 'name'));
        if (name.length < 2) return errors.push(`row ${i + 2}: missing name`);
        const code = normCode(get(r, 'code')) || null;
        const email = normEmail(get(r, 'email')) || null;
        const existing = (code && db.prepare('SELECT id FROM attendees WHERE code = ?').get(code)) || (email && db.prepare('SELECT id FROM attendees WHERE email = ?').get(email));
        const fields = [name, clean(get(r, 'company')) || null, email, normMobile(get(r, 'mobile')) || null, cat(get(r, 'category')),
          clean(get(r, 'host_name')) || null, clean(get(r, 'host_contact'), 120) || null];
        if (existing) {
          db.prepare('UPDATE attendees SET name = ?, company = ?, email = ?, mobile = ?, category = ?, host_name = ?, host_contact = ? WHERE id = ?').run(...fields, existing.id);
          updated++;
        } else {
          db.prepare('INSERT INTO attendees (id, code, name, company, email, mobile, category, host_name, host_contact, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(randomUUID(), code || newCode(), ...fields, 'prereg', now());
          added++;
        }
      });
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { added, updated, errors };
  }

  function find({ code, email, mobile }) {
    if (code) return db.prepare('SELECT * FROM attendees WHERE code = ?').get(normCode(code));
    if (email) return db.prepare('SELECT * FROM attendees WHERE email = ?').get(normEmail(email));
    const m = normMobile(mobile);
    if (m.length >= 7) return db.prepare('SELECT * FROM attendees WHERE substr(mobile, -8) = substr(?, -8)').get(m);
    return undefined;
  }

  function queuePrint(a) {
    const id = randomUUID();
    db.prepare('INSERT INTO print_jobs (id, attendee_id, zpl, status, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, a.id, badgeZpl(a), printerEnabled ? 'pending' : 'preview', now());
    return printerEnabled ? 'queued' : 'preview';
  }

  function checkIn(query) {
    const started = process.hrtime.bigint();
    const a = find(query ?? {});
    if (!a) throw httpError(404, 'not_found');
    const first = !a.checked_in_at;
    let badge = 'already_printed';
    db.exec('BEGIN');
    try {
      if (first) {
        db.prepare('UPDATE attendees SET checked_in_at = ? WHERE id = ?').run(now(), a.id);
        badge = queuePrint(a);
        if (a.category === 'VIP') {
          db.prepare('INSERT INTO alerts (id, attendee_id, status, webhook, created_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), a.id, 'open', webhookEnabled ? 'pending' : 'none', now());
        }
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    return { ...pub(a), first, badge, host: a.category === 'VIP' ? a.host_name : null, serverMs: Math.round(ms * 10) / 10 };
  }

  function walkIn({ name, company, email, mobile }) {
    name = clean(name, 60);
    if (name.length < 2) throw httpError(400, 'name_required');
    email = normEmail(email);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'email_invalid');
    mobile = normMobile(mobile);
    if (!email && mobile.length < 7) throw httpError(400, 'contact_required');
    const existing = find(email ? { email } : { mobile });
    if (existing) return checkIn({ code: existing.code });
    let code;
    do code = newCode(); while (db.prepare('SELECT 1 FROM attendees WHERE code = ?').get(code));
    db.prepare('INSERT INTO attendees (id, code, name, company, email, mobile, category, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), code, name, clean(company) || null, email || null, mobile || null, 'ATTENDEE', 'walkin', now());
    return checkIn({ code });
  }

  function reprint(attendeeId) {
    const a = db.prepare('SELECT * FROM attendees WHERE id = ?').get(String(attendeeId));
    if (!a) throw httpError(404, 'not_found');
    return { badge: queuePrint(a) };
  }

  function badge(code) {
    const a = find({ code });
    if (!a) throw httpError(404, 'not_found');
    return pub(a);
  }

  // Background workers call these.
  function pendingPrints() {
    return db.prepare("SELECT id, zpl, attempts FROM print_jobs WHERE status = 'pending' ORDER BY created_at LIMIT 10").all();
  }
  function markPrint(id, ok, error) {
    if (ok) db.prepare("UPDATE print_jobs SET status = 'done', done_at = ?, attempts = attempts + 1 WHERE id = ?").run(now(), id);
    else db.prepare(`UPDATE print_jobs SET attempts = attempts + 1, last_error = ?, status = CASE WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'pending' END WHERE id = ?`).run(String(error).slice(0, 200), id);
  }
  function retryFailedPrints() {
    return { retried: Number(db.prepare("UPDATE print_jobs SET status = 'pending', attempts = 0 WHERE status = 'failed'").run().changes) };
  }
  function pendingWebhooks() {
    return db.prepare(`SELECT al.id, al.attempts, a.name, a.company, a.category, a.host_name, a.host_contact, a.checked_in_at
      FROM alerts al JOIN attendees a ON a.id = al.attendee_id WHERE al.webhook = 'pending' ORDER BY al.created_at LIMIT 10`).all();
  }
  function markWebhook(id, ok) {
    if (ok) db.prepare("UPDATE alerts SET webhook = 'sent', attempts = attempts + 1 WHERE id = ?").run(id);
    else db.prepare(`UPDATE alerts SET attempts = attempts + 1, webhook = CASE WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'pending' END WHERE id = ?`).run(id);
  }

  function alerts() {
    return db.prepare(`SELECT al.id, al.webhook, al.created_at, a.name, a.company, a.host_name, a.host_contact
      FROM alerts al JOIN attendees a ON a.id = al.attendee_id WHERE al.status = 'open' ORDER BY al.created_at DESC`).all();
  }
  function ackAlert(id) {
    const r = db.prepare("UPDATE alerts SET status = 'ack', ack_at = ? WHERE id = ? AND status = 'open'").run(now(), String(id));
    if (!r.changes) throw httpError(404, 'alert_not_found');
    return { ack: true };
  }

  function arrivals(limit = 20) {
    return db.prepare('SELECT id, name, company, category, source, checked_in_at FROM attendees WHERE checked_in_at IS NOT NULL ORDER BY checked_in_at DESC LIMIT ?').all(limit);
  }

  function stats() {
    const one = sql => db.prepare(sql).get().n;
    return {
      registered: one("SELECT COUNT(*) AS n FROM attendees WHERE source = 'prereg'"),
      checkedIn: one('SELECT COUNT(*) AS n FROM attendees WHERE checked_in_at IS NOT NULL'),
      walkIns: one("SELECT COUNT(*) AS n FROM attendees WHERE source = 'walkin'"),
      vipArrived: one("SELECT COUNT(*) AS n FROM attendees WHERE category = 'VIP' AND checked_in_at IS NOT NULL"),
      lastHour: db.prepare('SELECT COUNT(*) AS n FROM attendees WHERE checked_in_at > ?').get(now() - 3600000).n,
      prints: db.prepare("SELECT status, COUNT(*) AS n FROM print_jobs GROUP BY status").all()
    };
  }

  function exportCsv() {
    const rows = db.prepare('SELECT code, name, company, email, mobile, category, source, checked_in_at FROM attendees ORDER BY created_at').all();
    const cell = x => {
      let s = x === null || x === undefined ? '' : String(x);
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map(r => [r.code, r.name, r.company, r.email, r.mobile, r.category, r.source, r.checked_in_at ? new Date(r.checked_in_at).toISOString() : ''].map(cell).join(','));
    return '﻿' + ['code,name,company,email,mobile,category,source,checked_in_at', ...lines].join('\r\n') + '\r\n';
  }

  return { importCsv, checkIn, walkIn, reprint, badge, pendingPrints, markPrint, retryFailedPrints, pendingWebhooks, markWebhook, alerts, ackAlert, arrivals, stats, exportCsv, close: () => db.close() };
}
