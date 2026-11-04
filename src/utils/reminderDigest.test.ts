import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCandidates, itemsDueWithin, localDateAndHour, selectAlerts } from './reminderDigest';
import { toRow, fromRow } from '../lib/db';
import type { ImportantDate, ReminderLog, ServiceLink } from '../types';

const service = (over: Partial<ServiceLink>): ServiceLink => ({
  id: 'srv-1', workspaceId: 'ws', productId: 'p1', environmentType: 'production', category: 'hosting',
  providerName: 'Vercel', accountEmail: '', loginUrl: '', plan: 'Pro', billingCycle: 'yearly', cost: 240,
  currency: 'USD', autoRenew: true, paymentMethodLabel: '', notes: '', status: 'active', vaultRefs: [],
  createdAt: '2026-01-01', renewalDate: '2026-12-01', ...over,
});

const date = (over: Partial<ImportantDate>): ImportantDate => ({
  id: 'd-1', workspaceId: 'ws', type: 'domain expiry', title: 'example.com expiry', dueDate: '2026-11-11',
  recurrence: 'yearly', status: 'open', source: 'manual', createdAt: '2026-01-01', ...over,
});

const names = new Map([['p1', 'PharmaFlow']]);

test('localDateAndHour converts to the workspace timezone', () => {
  const now = new Date('2026-11-04T22:30:00Z');
  assert.deepEqual(localDateAndHour(now, 'Africa/Nairobi'), { date: '2026-11-05', hour: 1 });
  assert.deepEqual(localDateAndHour(now, 'UTC'), { date: '2026-11-04', hour: 22 });
  assert.deepEqual(localDateAndHour(now, 'Not/AZone'), { date: '2026-11-04', hour: 22 });
});

test('buildCandidates skips done dates and cancelled services, adds trial ends', () => {
  const c = buildCandidates(
    [date({}), date({ id: 'd-2', status: 'done' }), date({ id: 'd-3', snoozedUntil: '2026-11-20', status: 'snoozed' })],
    [service({}), service({ id: 'srv-2', status: 'cancelled' }), service({ id: 'srv-3', status: 'trial', trialEndsAt: '2026-11-10', renewalDate: undefined })],
    names,
    [30, 7]
  );
  assert.deepEqual(c.map((x) => x.itemId).sort(), ['d-1', 'd-3', 'srv-1', 'srv-3:trial']);
  assert.equal(c.find((x) => x.itemId === 'd-3')!.dueDate, '2026-11-20');
  assert.equal(c.find((x) => x.itemId === 'srv-1')!.productName, 'PharmaFlow');
});

test('selectAlerts fires on lead days and re-fires next renewal cycle', () => {
  const candidates = buildCandidates([date({ dueDate: '2026-11-11' })], [], names, [7]);
  assert.equal(selectAlerts(candidates, '2026-11-04', [], 'email').length, 1);
  assert.equal(selectAlerts(candidates, '2026-11-05', [], 'email').length, 0);

  const thisYear: ReminderLog = { id: 'l', workspaceId: 'ws', itemType: 'importantDate', itemId: 'd-1', channel: 'email', leadDay: 7, sentAt: '2026-11-04T08:00:00Z', status: 'sent' };
  assert.equal(selectAlerts(candidates, '2026-11-04', [thisYear], 'email').length, 0, 'deduped same cycle');
  assert.equal(selectAlerts(candidates, '2026-11-04', [thisYear], 'telegram').length, 1, 'other channel unaffected');

  const lastYear = { ...thisYear, sentAt: '2025-11-04T08:00:00Z' };
  assert.equal(selectAlerts(candidates, '2026-11-04', [lastYear], 'email').length, 1, 'old cycle ignored');
});

test('itemsDueWithin includes overdue and sorts by urgency', () => {
  const c = buildCandidates([date({ id: 'a', dueDate: '2026-11-01' }), date({ id: 'b', dueDate: '2026-11-08' }), date({ id: 'c', dueDate: '2026-12-30' })], [], names, [7]);
  assert.deepEqual(itemsDueWithin(c, '2026-11-04', 7).map((i) => i.itemId), ['a', 'b']);
});

test('db row mapping round-trips and clears empty dates', () => {
  const row = toRow({ renewalDate: '', providerName: 'Neon', notes: undefined });
  assert.deepEqual(row, { renewal_date: null, provider_name: 'Neon' });
  assert.deepEqual(toRow({ snoozedUntil: undefined }, 'update'), { snoozed_until: null });
  assert.deepEqual(fromRow({ provider_name: 'Neon', trial_ends_at: null, vault_refs: [] }), { providerName: 'Neon', vaultRefs: [] });
});
