/**
 * Expiry checks against local stand-ins: an RDAP directory + registry (HTTP), a TLS server with a
 * throwaway self-signed certificate (made with openssl), and a recording Telegram API.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import tls from 'node:tls';
import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { checkCertificate, checkDomain, runExpiryChecks, type Checkers } from './expiry-checks-server';
import { fakeAdmin } from './test-fakes';
import type { ExpiryCheck } from '../types';

const listen = (server: http.Server | tls.Server) =>
  new Promise<number>((r) => server.listen(0, '127.0.0.1', () => r((server.address() as AddressInfo).port)));

test('domains: registry lookup, missing records, no expiry published, .et and bad input', async () => {
  let port = 0;
  const server = http.createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/rdap+json' });
      res.end(JSON.stringify(body));
    };
    if (req.url === '/dns.json') {
      return send(200, { services: [[['io', 'com'], [`http://127.0.0.1:${port}/rdap/`]]] });
    }
    if (req.url === '/rdap/domain/saasboss.io') {
      return send(200, {
        events: [{ eventAction: 'expiration', eventDate: '2027-11-12T10:00:00Z' }],
        entities: [{ roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text', 'NameCheap, Inc.']]] }],
      });
    }
    if (req.url === '/rdap/domain/quiet.com') return send(200, { events: [] });
    if (req.url === '/rdap/domain/down.com') return send(503, {});
    send(404, { errorCode: 404 });
  });
  port = await listen(server);
  process.env.RDAP_BOOTSTRAP_URL = `http://127.0.0.1:${port}/dns.json`;
  const now = new Date('2026-11-07T06:00:00Z');
  try {
    assert.deepEqual(await checkDomain('https://www.saasboss.io/pricing', now), {
      kind: 'domain', status: 'ok', expiresOn: '2027-11-12', by: 'NameCheap, Inc.', checkedAt: now.toISOString(),
    });
    assert.match((await checkDomain('nobody-owns-this.com', now)).message!, /registry has no record of nobody-owns-this.com/);
    assert.match((await checkDomain('down.com', now)).message!, /HTTP 503/);
    const quiet = await checkDomain('quiet.com', now);
    assert.equal(quiet.status, 'manual');
    const et = await checkDomain('minimart.et', now);
    assert.deepEqual([et.status, et.message], ['manual', '.et has no public expiry lookup; keep the date up to date by hand']);
    assert.equal((await checkDomain('not a domain', now)).status, 'error');
    // The registry directory can't be reached: say so (not that the domain is broken).
    process.env.RDAP_BOOTSTRAP_URL = 'http://127.0.0.1:1/dns.json';
    assert.equal((await checkDomain('saasboss.io', now)).message, "the registry lookup couldn't be reached; it is tried again on the next check.");
  } finally {
    delete process.env.RDAP_BOOTSTRAP_URL;
    server.close();
  }
});

test('SSL: reads the certificate, flags a self-signed one, refuses private addresses', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'st-cert-'));
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'),
      '-days', '45', '-subj', '/O=Test CA/CN=site.example.com'], { stdio: 'ignore' });
  } catch {
    t.skip('openssl is not available');
    return;
  }
  const key = readFileSync(join(dir, 'k.pem'));
  const cert = readFileSync(join(dir, 'c.pem'));
  const expected = new Date(new X509Certificate(cert).validTo).toISOString().slice(0, 10);
  const server = tls.createServer({ key, cert }, (s) => s.end());
  const port = await listen(server);
  const local = async () => [{ address: '127.0.0.1' }];
  try {
    const r = await checkCertificate(`https://site.example.com:${port}/login`, { allowPrivate: true, lookup: local });
    assert.equal(r.status, 'ok');
    assert.equal(r.expiresOn, expected);
    assert.equal(r.by, 'Test CA');
    assert.equal(r.problem, "it's self-signed");

    const blocked = await checkCertificate(`site.example.com:${port}`, { lookup: local });
    assert.deepEqual([blocked.status, blocked.message], ['error', 'site.example.com points to a private network address.']);

    server.close();
    const refused = await checkCertificate(`site.example.com:${port}`, { allowPrivate: true, lookup: local });
    assert.deepEqual([refused.status, refused.message], ['error', 'nothing answered on that port.']);

    const nodns = await checkCertificate('nowhere.example.com', { lookup: async () => { throw Object.assign(new Error('x'), { code: 'ENOTFOUND' }); } });
    assert.equal(nodns.message, "the name doesn't resolve (no DNS record).");
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('daily run: checks what is due, moves renewed dates, messages once per workspace', async () => {
  const sent: any[] = [];
  const tgServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      sent.push(JSON.parse(raw));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true,"result":{}}');
    });
  });
  const port = await listen(tgServer);
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_API_BASE = `http://127.0.0.1:${port}`;

  const now = new Date('2026-11-07T06:00:00Z');
  const recent = '2026-11-07T01:00:00.000Z'; // checked 5 hours ago: not again yet
  const old = '2026-11-06T01:00:00.000Z';
  const base = { workspace_id: 'ws-1', recurrence: 'yearly', source: 'manual', status: 'open', auto_check: true, last_check: null };
  const db: Record<string, any[]> = {
    workspaces: [{ id: 'ws-1', name: 'Yiro Studio' }],
    notification_settings: [{ workspace_id: 'ws-1', telegram_chat_id: '424242', telegram_enabled: true, email_enabled: false }],
    important_dates: [
      { ...base, id: 'd-renewed', type: 'domain expiry', title: 'saasboss.io domain', due_date: '2026-11-12', check_target: 'saasboss.io', last_checked_at: old,
        last_check: { kind: 'domain', status: 'ok', expiresOn: '2026-11-12', checkedAt: old } },
      { ...base, id: 'd-et', type: 'domain expiry', title: 'minimart.et', due_date: '2027-03-01', check_target: 'minimart.et', last_checked_at: null, lead_days: [30, 14, 7, 1] },
      { ...base, id: 'd-ssl', type: 'SSL expiry', title: 'app SSL', due_date: '2026-12-01', check_target: 'app.saasboss.io', last_checked_at: old,
        last_check: { kind: 'ssl', status: 'ok', expiresOn: '2026-12-01', checkedAt: old } },
      { ...base, id: 'd-fresh', type: 'domain expiry', title: 'fresh.io', due_date: '2027-01-01', check_target: 'fresh.io', last_checked_at: recent },
      { ...base, id: 'd-off', type: 'domain expiry', title: 'off.io', due_date: '2027-01-01', check_target: 'off.io', auto_check: false, last_checked_at: null },
      { ...base, id: 'd-done', type: 'SSL expiry', title: 'done', due_date: '2026-01-01', check_target: 'x.io', status: 'done', last_checked_at: null },
    ],
    audit_logs: [],
  };
  const asked: string[] = [];
  const checkers: Checkers = {
    domain: async (t, at): Promise<ExpiryCheck> => {
      asked.push(t);
      return t === 'minimart.et'
        ? { kind: 'domain', status: 'manual', message: '.et has no public expiry lookup', checkedAt: at.toISOString() }
        : { kind: 'domain', status: 'ok', expiresOn: '2027-11-12', by: 'Namecheap', checkedAt: at.toISOString() };
    },
    ssl: async (t, at) => {
      asked.push(t);
      return { kind: 'ssl', status: 'ok', expiresOn: '2027-01-30', by: "Let's Encrypt", problem: 'it has expired', checkedAt: at.toISOString() };
    },
  };

  try {
    const result = await runExpiryChecks(fakeAdmin(db), { now, appUrl: 'https://saas-boss-v20.vercel.app', checkers });
    assert.deepEqual(asked.sort(), ['app.saasboss.io', 'minimart.et', 'saasboss.io']);
    assert.deepEqual(result, { checked: 3, moved: 2, notices: 2, errors: [] });
    const row = (id: string) => db.important_dates.find((d) => d.id === id);
    assert.equal(row('d-renewed').due_date, '2027-11-12');
    assert.equal(row('d-renewed').last_checked_at, now.toISOString());
    assert.equal(row('d-renewed').last_check.by, 'Namecheap');
    assert.deepEqual(row('d-et').lead_days, [60, 30, 14, 7, 3, 1]);
    assert.equal(row('d-et').due_date, '2027-03-01');
    assert.equal(row('d-ssl').due_date, '2027-01-30');
    assert.equal(row('d-fresh').last_checked_at, recent, 'checked recently: left alone');
    assert.equal(db.audit_logs.length, 2);

    assert.equal(sent.length, 1, 'one message for the workspace');
    assert.equal(sent[0].chat_id, '424242');
    assert.match(sent[0].text, /^🔎 <b>Expiry checks · Yiro Studio<\/b>/);
    assert.match(sent[0].text, /✅ saasboss\.io was renewed: it now expires 2027-11-12 \(was 2026-11-12\)\./);
    assert.match(sent[0].text, /🔒 app\.saasboss\.io: browsers won't trust this certificate \(it has expired\)\./);
    assert.ok(!/minimart/.test(sent[0].text), 'manual domains need no message');

    // The next hourly run finds nothing due.
    const again = await runExpiryChecks(fakeAdmin(db), { now: new Date('2026-11-07T07:00:00Z'), checkers });
    assert.equal(again.checked, 0);
    assert.equal(sent.length, 1);
  } finally {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_API_BASE;
    tgServer.close();
  }
});

test('daily run: slow checks stop at the time budget; the rest wait for the next run', async () => {
  const dates = Array.from({ length: 10 }, (_, i) => ({
    id: `d${i}`, workspace_id: 'ws-1', type: 'domain expiry', title: `d${i}.io`, due_date: '2027-01-01', check_target: `d${i}.io`,
    recurrence: 'none', source: 'manual', status: 'open', auto_check: true, last_checked_at: null,
  }));
  const db: Record<string, any[]> = { important_dates: dates, workspaces: [], notification_settings: [], audit_logs: [] };
  let running = 0;
  let maxRunning = 0;
  const slow: Checkers = {
    domain: async (_t, at) => {
      maxRunning = Math.max(maxRunning, ++running);
      await new Promise((r) => setTimeout(r, 40));
      running--;
      return { kind: 'domain', status: 'ok', expiresOn: '2027-01-01', checkedAt: at.toISOString() };
    },
    ssl: async (_t, at) => ({ kind: 'ssl', status: 'ok', checkedAt: at.toISOString() }),
  };
  const r = await runExpiryChecks(fakeAdmin(db), { now: new Date('2026-11-07T06:00:00Z'), checkers: slow, budgetMs: 20 });
  assert.equal(maxRunning, 4, 'four at a time');
  assert.equal(r.checked, 4, 'nothing new starts after the budget');
  assert.equal(db.important_dates.filter((d) => d.last_checked_at === null).length, 6);
});
