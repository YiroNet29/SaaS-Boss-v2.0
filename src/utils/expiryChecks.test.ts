import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyExpiryCheck,
  describeCheck,
  describeTlsProblem,
  isPublicAddress,
  normalizeDomain,
  normalizeHost,
  parseRdapDomain,
  rdapBaseFor,
} from './expiryChecks';
import type { ExpiryCheck, ImportantDate } from '../types';

const date = (over: Partial<ImportantDate> = {}): ImportantDate => ({
  id: 'd1', workspaceId: 'ws', type: 'domain expiry', title: 'saasboss.io domain', dueDate: '2026-11-12', recurrence: 'yearly',
  status: 'open', source: 'manual', createdAt: '', checkTarget: 'saasboss.io', autoCheck: true, ...over,
});
const at = '2026-11-07T06:00:00.000Z';
const ok = (over: Partial<ExpiryCheck> = {}): ExpiryCheck => ({ kind: 'domain', status: 'ok', expiresOn: '2026-11-12', checkedAt: at, ...over });

test('domain and host input is cleaned up', () => {
  assert.equal(normalizeDomain('https://www.SaaSBoss.io/pricing'), 'saasboss.io');
  assert.equal(normalizeDomain('app.saasboss.io'), 'saasboss.io');
  assert.equal(normalizeDomain('shop.minimart.com.et'), 'minimart.com.et');
  assert.equal(normalizeDomain('minimart.et'), 'minimart.et');
  assert.equal(normalizeDomain('bücher.de'), 'xn--bcher-kva.de');
  assert.equal(normalizeDomain('localhost'), null);
  assert.equal(normalizeDomain('10.0.0.1'), null);
  assert.equal(normalizeDomain('not a domain'), null);
  assert.equal(normalizeHost('https://App.SaaSBoss.io/login'), 'app.saasboss.io');
  assert.equal(normalizeHost('api.example.com:8443'), 'api.example.com:8443');
  assert.equal(normalizeHost('example.com:443'), 'example.com');
  assert.equal(normalizeHost('[::1]'), null);
});

test('RDAP: the right registry server, the longest match wins, none for .et', () => {
  const boot = { services: [[['com', 'net'], ['https://rdap.verisign.com/com/v1/']], [['io'], ['http://x/', 'https://rdap.nic.io']], [['uk'], ['https://rdap.nominet.uk/uk/']], [['co.uk'], ['https://special/']]] } as any;
  assert.equal(rdapBaseFor('saasboss.io', boot), 'https://rdap.nic.io/');
  assert.equal(rdapBaseFor('example.com', boot), 'https://rdap.verisign.com/com/v1/');
  assert.equal(rdapBaseFor('shop.co.uk', boot), 'https://special/');
  assert.equal(rdapBaseFor('minimart.et', boot), null);
});

test('RDAP answer: expiry date and registrar', () => {
  const answer = {
    ldhName: 'SAASBOSS.IO',
    events: [
      { eventAction: 'registration', eventDate: '2024-11-12T10:00:00Z' },
      { eventAction: 'expiration', eventDate: '2027-11-12T10:00:00Z' },
    ],
    entities: [
      { roles: ['registrar'], handle: '1068', vcardArray: ['vcard', [['version', {}, 'text', '4.0'], ['fn', {}, 'text', 'NameCheap, Inc.']]] },
      { roles: ['abuse'], vcardArray: ['vcard', [['fn', {}, 'text', 'Abuse desk']]] },
    ],
  };
  assert.deepEqual(parseRdapDomain(answer), { expiresOn: '2027-11-12', registrar: 'NameCheap, Inc.' });
  assert.deepEqual(parseRdapDomain({ events: [{ eventAction: 'registration expiration', eventDate: '2027-01-02T00:00:00Z' }] }), { expiresOn: '2027-01-02', registrar: undefined });
  assert.deepEqual(parseRdapDomain(null), { expiresOn: undefined, registrar: undefined });
});

test('private and local addresses are refused', () => {
  for (const ip of ['10.1.2.3', '127.0.0.1', '172.20.0.5', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ['76.76.21.21', '172.15.0.1', '2606:4700::6810:84e5']) assert.equal(isPublicAddress(ip), true, ip);
  assert.equal(describeTlsProblem('CERT_HAS_EXPIRED'), 'it has expired');
  assert.equal(describeTlsProblem('SOMETHING_ELSE'), 'SOMETHING_ELSE');
});

test('renewed domain: the date moves on and you are told once', () => {
  const r = applyExpiryCheck(date({ lastCheck: ok(), status: 'snoozed', snoozedUntil: '2026-11-10' }), ok({ expiresOn: '2027-11-12', by: 'Namecheap' }));
  assert.equal(r.patch.dueDate, '2027-11-12');
  assert.equal(r.patch.status, 'open');
  assert.ok('snoozedUntil' in r.patch && r.patch.snoozedUntil === undefined, 'snooze cleared');
  assert.deepEqual(r.notices, [{ tone: 'good', text: '✅ saasboss.io was renewed: it now expires 2027-11-12 (was 2026-11-12).' }]);
  // Same answer the next day: nothing to say.
  assert.deepEqual(applyExpiryCheck(date({ dueDate: '2027-11-12', lastCheck: ok({ expiresOn: '2027-11-12' }) }), ok({ expiresOn: '2027-11-12' })).notices, []);
});

test('earlier than you had: corrected with a warning; first check just reports', () => {
  const r = applyExpiryCheck(date({ lastCheck: ok() }), ok({ expiresOn: '2026-11-01' }));
  assert.equal(r.patch.dueDate, '2026-11-01');
  assert.equal(r.notices[0].tone, 'warn');
  assert.match(r.notices[0].text, /earlier than the 2026-11-12 you had/);
  const first = applyExpiryCheck(date(), ok({ expiresOn: '2027-11-12' }));
  assert.deepEqual(first.notices, [{ tone: 'good', text: '🌐 saasboss.io: expiry found, 2027-11-12. The date is updated.' }]);
});

test('failures are reported once, not every day', () => {
  const err: ExpiryCheck = { kind: 'domain', status: 'error', message: 'Registry lookup failed (HTTP 503).', checkedAt: at };
  assert.equal(applyExpiryCheck(date({ lastCheck: ok() }), err).notices.length, 1);
  assert.equal(applyExpiryCheck(date({ lastCheck: err }), err).notices.length, 0);
  assert.equal(applyExpiryCheck(date({ lastCheck: err }), err).patch.dueDate, undefined, 'date untouched');
});

test('.et: no public lookup, reminders start earlier (once)', () => {
  const manual: ExpiryCheck = { kind: 'domain', status: 'manual', message: '.et has no public expiry lookup.', checkedAt: at };
  const r = applyExpiryCheck(date({ checkTarget: 'minimart.et', leadDays: [30, 14, 7, 1] }), manual);
  assert.deepEqual(r.patch.leadDays, [60, 30, 14, 7, 3, 1]);
  assert.deepEqual(r.notices, []);
  assert.equal(applyExpiryCheck(date({ leadDays: [30], lastCheck: manual }), manual).patch.leadDays, undefined, 'your later changes are kept');
});

test('SSL: silent renewals, but an untrusted certificate is flagged', () => {
  const ssl = date({ type: 'SSL expiry', checkTarget: 'app.saasboss.io', dueDate: '2026-12-01' });
  const renewed = applyExpiryCheck({ ...ssl, lastCheck: ok({ kind: 'ssl', expiresOn: '2026-12-01' }) }, ok({ kind: 'ssl', expiresOn: '2027-02-28', by: "Let's Encrypt" }));
  assert.equal(renewed.patch.dueDate, '2027-02-28');
  assert.deepEqual(renewed.notices, []);
  const bad = ok({ kind: 'ssl', expiresOn: '2026-12-01', problem: "it's issued for a different name" });
  const flagged = applyExpiryCheck({ ...ssl, lastCheck: ok({ kind: 'ssl', expiresOn: '2026-12-01' }) }, bad);
  assert.deepEqual(flagged.notices, [{ tone: 'bad', text: "🔒 app.saasboss.io: browsers won't trust this certificate (it's issued for a different name)." }]);
  assert.deepEqual(applyExpiryCheck({ ...ssl, lastCheck: bad }, bad).notices, [], 'not repeated');
});

test('describeCheck', () => {
  const now = new Date('2026-11-07T09:00:00Z');
  assert.equal(describeCheck(undefined), 'Not checked yet');
  assert.equal(describeCheck(ok({ expiresOn: '2027-11-12', by: 'Namecheap' }), now), 'Checked 3 h ago · registry: 2027-11-12 (Namecheap)');
  assert.equal(describeCheck({ kind: 'ssl', status: 'error', message: 'Nothing answered on port 443.', checkedAt: at }, now), 'Check failed 3 h ago: Nothing answered on port 443.');
});
