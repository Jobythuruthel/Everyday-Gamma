import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { createEngine, decodeJpegDataUrl, generateWithApi } from '../engine.js';
import { styles, tmp, jpegDataUrl } from './helpers.js';

test('styles: bilingual titles, taglines, a full local look and a prompt', () => {
  assert.ok(styles.styles.length >= 3 && styles.styles.length <= 6);
  for (const s of styles.styles) {
    assert.ok(s.title.en && s.title.ar && s.tagline.en && s.tagline.ar, s.id);
    assert.ok([s.local.shadow, s.local.mid, s.local.light].every(c => c.length === 3), s.id);
    assert.match(s.local.accent, /^#[0-9A-F]{6}$/i);
    assert.ok(s.prompt.includes('keep the face'), 'prompt protects identity');
  }
});

test('JPEG validation rejects non-JPEG, tiny and oversized payloads', () => {
  assert.ok(decodeJpegDataUrl(jpegDataUrl()).length > 1000);
  assert.throws(() => decodeJpegDataUrl('data:image/png;base64,AAAA'), /image_invalid/);
  assert.throws(() => decodeJpegDataUrl(jpegDataUrl(10)), /image_invalid/);
  assert.throws(() => decodeJpegDataUrl('data:image/jpeg;base64,' + Buffer.alloc(5000).toString('base64')), /image_invalid/, 'no JPEG marker');
  assert.throws(() => decodeJpegDataUrl(jpegDataUrl(7_000_000)), /image_invalid/);
});

test('saving needs face consent and a real style; download needs a lead', () => {
  const dir = tmp();
  const e = createEngine({ photoDir: dir, styles });
  assert.throws(() => e.savePhoto({ image: jpegDataUrl(), styleId: 'cyber' }), /consent_required/);
  assert.throws(() => e.savePhoto({ image: jpegDataUrl(), styleId: 'nope', consentFace: true }), /unknown_style/);
  const { id } = e.savePhoto({ image: jpegDataUrl(), styleId: 'cyber', consentFace: true, lang: 'ar' });
  assert.equal(readdirSync(dir).length, 1, 'only the final portrait is on disk');
  assert.throws(() => e.captureLead(id, {}), /contact_required/);
  assert.throws(() => e.captureLead(id, { email: 'bad' }), /email_invalid/);
  const { token } = e.captureLead(id, { email: 'Visitor@Mail.com', marketing: true });
  assert.match(token, /^[\w-]{16}$/);
  assert.equal(e.captureLead(id, { mobile: '+97333001122' }).token, token, 'same link on a second submit');
  const got = e.byToken(token, { count: true });
  assert.equal(got.bytes[0], 0xff);
  assert.equal(e.stats().downloads, 1);
  assert.throws(() => e.byToken('x'.repeat(16)), /photo_not_found/);
});

test('gallery shows approved photos only; operator can hide and delete', () => {
  const e = createEngine({ photoDir: tmp(), styles });
  const a = e.savePhoto({ image: jpegDataUrl(), styleId: 'space', consentFace: true });
  const b = e.savePhoto({ image: jpegDataUrl(), styleId: 'vision', consentFace: true });
  assert.equal(e.gallery().length, 0);
  assert.throws(() => e.galleryImage(a.id), /photo_not_found/);
  e.review(a.id, 'approved'); e.review(b.id, 'rejected');
  assert.deepEqual(e.gallery().map(p => p.id), [a.id]);
  assert.ok(e.galleryImage(a.id).length > 0);
  assert.equal(e.pending().length, 0);
  assert.throws(() => e.review(a.id, 'maybe'), /decision_invalid/);
  e.deletePhoto(a.id);
  assert.equal(e.gallery().length, 0);
});

test('retention deletes image files after the configured days', () => {
  let t = Date.parse('2026-12-04T10:00:00Z');
  const dir = tmp();
  const e = createEngine({ photoDir: dir, styles, now: () => t, retentionDays: 30 });
  const { id } = e.savePhoto({ image: jpegDataUrl(), styleId: 'cyber', consentFace: true });
  const { token } = e.captureLead(id, { email: 'a@b.co' });
  assert.equal(e.purgeExpired().purged, 0);
  t += 31 * 86400000;
  assert.equal(e.purgeExpired().purged, 1);
  assert.equal(existsSync(`${dir}/${id}.jpg`), false);
  assert.throws(() => e.byToken(token), /photo_not_found/);
  assert.match(e.exportCsv(), /a@b\.co/, 'the lead survives for export');
});

test('stats and lead export', () => {
  const e = createEngine({ photoDir: tmp(), styles });
  for (const s of ['cyber', 'cyber', 'space']) e.savePhoto({ image: jpegDataUrl(), styleId: s, consentFace: true });
  const { id } = e.savePhoto({ image: jpegDataUrl(), styleId: 'vision', consentFace: true, engine: 'api' });
  e.captureLead(id, { email: '=x@y.co', marketing: true });
  const s = e.stats();
  assert.equal(s.sessions, 4);
  assert.equal(s.leads, 1);
  assert.equal(s.leadRate, 25);
  assert.equal(s.byStyle[0].style, 'cyber');
  assert.equal(s.apiShare, 1);
  assert.match(e.exportCsv(), /'=x@y\.co,,yes/, 'formula injection neutralised, empty mobile column');
});

test('image API client sends a multipart edit request and decodes the result', async () => {
  let seen;
  const png = Buffer.from('fake-png');
  const out = await generateWithApi({
    image: Buffer.from([0xff, 0xd8, 1, 2]), prompt: 'hero', apiKey: 'k', model: 'm',
    fetchImpl: async (url, opt) => { seen = { url, opt }; return { ok: true, json: async () => ({ data: [{ b64_json: png.toString('base64') }] }) }; }
  });
  assert.deepEqual(out, png);
  assert.equal(seen.opt.headers.authorization, 'Bearer k');
  assert.equal(seen.opt.body.get('model'), 'm');
  assert.equal(seen.opt.body.get('prompt'), 'hero');
  assert.ok(seen.opt.body.get('image') instanceof Blob);
  await assert.rejects(generateWithApi({ image: Buffer.alloc(4), prompt: 'x', apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 429 }) }), /image_api_429/);
});
