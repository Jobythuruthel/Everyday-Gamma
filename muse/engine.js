// MUSE engine: photo sessions, lead-gated delivery, operator approval and retention.
// Only the final styled image is stored. The raw camera frame is never written to disk.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function httpError(status, code) {
  return Object.assign(new Error(code), { status, code });
}

export function decodeJpegDataUrl(dataUrl, maxBytes = 6_000_000) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''));
  if (!m) throw httpError(400, 'image_invalid');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 1000 || buf.length > maxBytes || buf[0] !== 0xff || buf[1] !== 0xd8) throw httpError(400, 'image_invalid');
  return buf;
}

// Optional generative step: an OpenAI-compatible image edit endpoint. Configure with env vars; off by default.
export async function generateWithApi({ image, prompt, apiKey, url = 'https://api.openai.com/v1/images/edits', model = 'gpt-image-1', fetchImpl = fetch, timeoutMs = 60000 }) {
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', prompt);
  form.append('size', '1024x1536');
  form.append('image', new Blob([image], { type: 'image/jpeg' }), 'capture.jpg');
  const res = await fetchImpl(url, { method: 'POST', headers: { authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`image_api_${res.status}`);
  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('image_api_empty');
  return Buffer.from(b64, 'base64');
}

export function createEngine({ dbPath = ':memory:', photoDir, styles, now = () => Date.now(), retentionDays = 30 } = {}) {
  if (!photoDir) throw new Error('photoDir required');
  mkdirSync(photoDir, { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY, token TEXT UNIQUE, style TEXT NOT NULL, engine TEXT NOT NULL, lang TEXT,
      consent_face INTEGER NOT NULL, email TEXT, mobile TEXT, marketing INTEGER NOT NULL DEFAULT 0,
      review TEXT NOT NULL DEFAULT 'pending', downloads INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, lead_at INTEGER
    );
  `);
  const file = id => join(photoDir, `${id}.jpg`);
  const styleIds = new Set(styles.styles.map(s => s.id));

  function savePhoto({ image, styleId, engine, lang, consentFace }) {
    if (consentFace !== true) throw httpError(400, 'consent_required');
    if (!styleIds.has(styleId)) throw httpError(400, 'unknown_style');
    const buf = decodeJpegDataUrl(image);
    const id = randomUUID();
    writeFileSync(file(id), buf);
    db.prepare('INSERT INTO photos (id, style, engine, lang, consent_face, created_at) VALUES (?, ?, ?, ?, 1, ?)')
      .run(id, styleId, engine === 'api' ? 'api' : 'local', lang === 'ar' ? 'ar' : 'en', now());
    return { id };
  }

  // The download link is released only after the visitor leaves an email or mobile.
  function captureLead(id, { email, mobile, marketing }) {
    const p = db.prepare('SELECT * FROM photos WHERE id = ?').get(String(id));
    if (!p) throw httpError(404, 'photo_not_found');
    email = String(email ?? '').trim().toLowerCase().slice(0, 120);
    mobile = String(mobile ?? '').replace(/[^\d+]/g, '').slice(0, 20);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'email_invalid');
    if (!email && mobile.replace(/\D/g, '').length < 7) throw httpError(400, 'contact_required');
    const token = p.token ?? randomBytes(12).toString('base64url');
    db.prepare('UPDATE photos SET token = ?, email = ?, mobile = ?, marketing = ?, lead_at = ? WHERE id = ?')
      .run(token, email || null, mobile || null, marketing === true ? 1 : 0, now(), p.id);
    return { token };
  }

  function byToken(token, { count = false } = {}) {
    const p = db.prepare('SELECT * FROM photos WHERE token = ?').get(String(token));
    if (!p || !existsSync(file(p.id))) throw httpError(404, 'photo_not_found');
    if (count) db.prepare('UPDATE photos SET downloads = downloads + 1 WHERE id = ?').run(p.id);
    return { photo: p, bytes: readFileSync(file(p.id)) };
  }

  function galleryImage(id) {
    const p = db.prepare("SELECT id FROM photos WHERE id = ? AND review = 'approved'").get(String(id));
    if (!p || !existsSync(file(p.id))) throw httpError(404, 'photo_not_found');
    return readFileSync(file(p.id));
  }
  function gallery(limit = 12) {
    return db.prepare("SELECT id, style FROM photos WHERE review = 'approved' ORDER BY created_at DESC LIMIT ?").all(limit);
  }

  function pending(limit = 40) {
    return db.prepare("SELECT id, style, engine, created_at FROM photos WHERE review = 'pending' ORDER BY created_at DESC LIMIT ?").all(limit);
  }
  function adminImage(id) {
    const p = db.prepare('SELECT id FROM photos WHERE id = ?').get(String(id));
    if (!p || !existsSync(file(p.id))) throw httpError(404, 'photo_not_found');
    return readFileSync(file(p.id));
  }
  function review(id, decision) {
    if (!['approved', 'rejected'].includes(decision)) throw httpError(400, 'decision_invalid');
    const r = db.prepare('UPDATE photos SET review = ? WHERE id = ?').run(decision, String(id));
    if (!r.changes) throw httpError(404, 'photo_not_found');
    return { review: decision };
  }

  function deletePhoto(id) {
    const p = db.prepare('SELECT id FROM photos WHERE id = ?').get(String(id));
    if (!p) throw httpError(404, 'photo_not_found');
    rmSync(file(p.id), { force: true });
    db.prepare('DELETE FROM photos WHERE id = ?').run(p.id);
    return { deleted: true };
  }

  // Deletes images older than the retention period. Lead contact details stay for export unless the photo row is deleted.
  function purgeExpired() {
    const cutoff = now() - retentionDays * 86400000;
    const old = db.prepare('SELECT id FROM photos WHERE created_at < ?').all(cutoff);
    for (const p of old) rmSync(file(p.id), { force: true });
    db.prepare("UPDATE photos SET review = 'expired' WHERE created_at < ?").run(cutoff);
    return { purged: old.length };
  }

  function stats() {
    const one = sql => db.prepare(sql).get().n;
    const sessions = one('SELECT COUNT(*) AS n FROM photos');
    const leads = one('SELECT COUNT(*) AS n FROM photos WHERE lead_at IS NOT NULL');
    return {
      sessions, leads, leadRate: sessions ? Math.round(100 * leads / sessions) : null,
      marketingOptIns: one('SELECT COUNT(*) AS n FROM photos WHERE marketing = 1'),
      downloads: one('SELECT COALESCE(SUM(downloads), 0) AS n FROM photos'),
      pending: one("SELECT COUNT(*) AS n FROM photos WHERE review = 'pending'"),
      byStyle: db.prepare('SELECT style, COUNT(*) AS n FROM photos GROUP BY style ORDER BY n DESC').all(),
      apiShare: one("SELECT COUNT(*) AS n FROM photos WHERE engine = 'api'")
    };
  }

  function exportCsv() {
    const rows = db.prepare('SELECT id, style, email, mobile, marketing, downloads, lang, created_at, lead_at FROM photos WHERE lead_at IS NOT NULL ORDER BY created_at').all();
    const cell = x => {
      let s = x === null || x === undefined ? '' : String(x);
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map(r => [r.id, r.style, r.email, r.mobile, r.marketing ? 'yes' : 'no', r.downloads, r.lang, new Date(r.created_at).toISOString()].map(cell).join(','));
    return '﻿' + ['photo_id,style,email,mobile,marketing_consent,downloads,lang,created_at', ...lines].join('\r\n') + '\r\n';
  }

  return { savePhoto, captureLead, byToken, gallery, galleryImage, pending, adminImage, review, deletePhoto, purgeExpired, stats, exportCsv, close: () => db.close() };
}
