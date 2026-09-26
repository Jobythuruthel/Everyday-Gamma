import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEngine, parseCsv } from '../engine.js';
import { badgeZpl, zplField } from '../printer.js';

const sample = readFileSync(new URL('../sample-attendees.csv', import.meta.url), 'utf8');

test('CSV parser: quotes, escaped quotes, commas, CRLF, BOM, blank lines', () => {
  const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n1,2');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"'], ['1', '2']]);
});

test('ZPL: control characters in names are hex-escaped, never break the label', () => {
  assert.equal(zplField('A_B^C~D\\E'), 'A_5FB_5EC_7ED_5CE');
  const z = badgeZpl({ name: 'Evil ^XZ^XA', company: 'Co', category: 'VIP', code: 'VIP0001' });
  assert.equal(z.match(/\^XA/g).length, 1, 'only one label start');
  assert.equal(z.match(/\^XZ/g).length, 1, 'only one label end');
  assert.match(z, /\^CI28/);
  assert.match(z, /QA,VIP0001/);
});

test('import adds, re-import updates, bad rows are reported', () => {
  const e = createEngine();
  assert.deepEqual(e.importCsv(sample), { added: 4, updated: 0, errors: [] });
  const again = e.importCsv(sample.replace('Omar Khalid', 'Omar K. Khalid') + ',nobody@example.com\n');
  assert.equal(again.updated, 4);
  assert.equal(again.errors.length, 1);
  assert.equal(e.stats().registered, 4);
  assert.throws(() => e.importCsv('company\nX'), /csv_needs_name_column/);
});

test('check-in by code, email and mobile; first scan prints once, VIP alerts once', () => {
  const e = createEngine({ printerEnabled: true });
  e.importCsv(sample);
  const r = e.checkIn({ code: ' vip0001 ' });
  assert.equal(r.first, true);
  assert.equal(r.vip, true);
  assert.equal(r.badge, 'queued');
  assert.equal(r.host, 'Joby T.');
  assert.ok(r.serverMs < 50, `check-in took ${r.serverMs} ms on the server`);
  assert.equal(e.checkIn({ code: 'VIP0001' }).first, false, 'second scan is welcome back, no duplicate badge');
  assert.equal(e.alerts()[0].webhook, 'none', 'no webhook configured: alert shows on the staff console only');
  assert.equal(e.pendingWebhooks().length, 0);
  assert.equal(e.pendingPrints().length, 1);
  assert.equal(e.alerts().length, 1);
  assert.equal(e.checkIn({ email: 'OMAR@example.com' }).name, 'Omar Khalid');
  assert.equal(e.checkIn({ mobile: '00966 50 011 2233' }).name, 'Layla Haddad');
  assert.throws(() => e.checkIn({ code: 'NOPE' }), /not_found/);
  assert.throws(() => e.checkIn({ mobile: '12' }), /not_found/);
});

test('walk-ins need a name and a contact, get a unique code, and never duplicate', () => {
  const e = createEngine();
  assert.throws(() => e.walkIn({ name: 'A', email: 'a@b.co' }), /name_required/);
  assert.throws(() => e.walkIn({ name: 'Ali', email: 'bad' }), /email_invalid/);
  assert.throws(() => e.walkIn({ name: 'Ali' }), /contact_required/);
  const w = e.walkIn({ name: 'Ali Reza', company: 'X', email: 'ali@x.com' });
  assert.equal(w.first, true);
  assert.equal(w.badge, 'preview', 'no printer: browser preview');
  assert.match(w.code, /^[A-Z2-9]{8}$/);
  const dup = e.walkIn({ name: 'Ali Reza', email: 'ALI@x.com' });
  assert.equal(dup.first, false);
  assert.equal(e.stats().walkIns, 1);
});

test('print queue retries, then fails after 5 attempts, and can be retried', () => {
  const e = createEngine({ printerEnabled: true });
  e.importCsv(sample);
  e.checkIn({ code: 'ATT0002' });
  const [job] = e.pendingPrints();
  for (let i = 0; i < 5; i++) e.markPrint(job.id, false, 'printer_timeout');
  assert.equal(e.pendingPrints().length, 0);
  assert.equal(e.stats().prints.find(p => p.status === 'failed').n, 1);
  assert.equal(e.retryFailedPrints().retried, 1);
  e.markPrint(job.id, true);
  assert.equal(e.stats().prints.find(p => p.status === 'done').n, 1);
});

test('export and alert acknowledgement', () => {
  const e = createEngine();
  e.importCsv('name,email,category\n=SUM(A1),x@y.com,VIP\n');
  e.checkIn({ email: 'x@y.com' });
  assert.match(e.exportCsv(), /'=SUM\(A1\)/);
  const [a] = e.alerts();
  e.ackAlert(a.id);
  assert.equal(e.alerts().length, 0);
  assert.throws(() => e.ackAlert(a.id), /alert_not_found/);
});
