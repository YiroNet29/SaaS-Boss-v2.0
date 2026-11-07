import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMoneyAlerts, type MoneyAlertInput } from './moneyAlerts';
import type { PaymentSource, ServiceLink } from '../types';

const card: PaymentSource = {
  id: 'src-grey', workspaceId: 'ws', name: 'Grey', kind: 'card', currency: 'USD', prepaid: true, openingBalance: 30,
  last4: '4821', expiresOn: '2026-11-30', notes: '', archived: false, createdAt: '',
};
const friend: PaymentSource = { ...card, id: 'src-abebe', name: 'Abebe', kind: 'person', prepaid: false, openingBalance: 0, expiresOn: undefined };
const svc = (over: Partial<ServiceLink>): ServiceLink => ({
  id: 's', workspaceId: 'ws', productId: 'p', environmentType: 'production', category: 'hosting', providerName: 'Vercel',
  accountEmail: '', loginUrl: '', plan: '', billingCycle: 'monthly', cost: 20, currency: 'USD', autoRenew: true,
  paymentMethodLabel: '', notes: '', status: 'active', vaultRefs: [], createdAt: '', paymentSourceId: 'src-grey', ...over,
});
const base = (today: string, over: Partial<MoneyAlertInput> = {}): MoneyAlertInput => ({
  sources: [card, friend],
  services: [svc({ id: 'a', providerName: 'Neon', renewalDate: '2026-11-10', cost: 19 }), svc({ id: 'b', providerName: 'Vercel', renewalDate: '2026-11-14', cost: 20 })],
  payments: [{ id: 'p1', workspaceId: 'ws', sourceId: 'src-abebe', paidOn: '2026-10-12', amount: 25, currency: 'USD', origin: 'manual', note: '', createdAt: '' }],
  transactions: [],
  etbPerUsd: 150,
  today,
  ...over,
});

test('dashboard view: everything current (top-up, expiry within 45 days, money owed)', () => {
  const a = computeMoneyAlerts(base('2026-11-07'));
  assert.deepEqual(a.map((x) => x.kind), ['top_up', 'expiry', 'owed']);
  const top = a[0];
  assert.equal(top.itemId, 'src-grey:topup:2026-11-14'); // 30 - 19 = 11 ok, then -9 on Nov 14
  assert.equal(top.leadDay, 7);
  assert.match(top.text, /Top up Grey by \$9 \(≈ ETB 1,350\) before 2026-11-14/);
  assert.match(a[1].text, /expires in 23 days/);
  assert.match(a[2].text, /You owe Abebe \$25/);
});

test('reminder job: only on lead days, and the monthly summary only on the 1st', () => {
  // Nov 7: top-up is 7 days away (lead day), expiry 23 days away (not a lead day), not the 1st.
  assert.deepEqual(computeMoneyAlerts(base('2026-11-07'), { onlyLeadDays: true }).map((x) => x.kind), ['top_up']);
  // Nov 8: 6 days before the shortfall: nothing.
  assert.deepEqual(computeMoneyAlerts(base('2026-11-08'), { onlyLeadDays: true }), []);
  // Nov 16: card expires in 14 days; Nov 14 charge has passed, no shortfall in window.
  assert.deepEqual(computeMoneyAlerts(base('2026-11-16'), { onlyLeadDays: true }).map((x) => [x.kind, x.leadDay]), [['expiry', 14]]);
  // Dec 1: the "you owe" summary (and the card has expired, but 0-day expiry was Nov 30).
  assert.deepEqual(computeMoneyAlerts(base('2026-12-01', { sources: [friend] }), { onlyLeadDays: true }).map((x) => [x.kind, x.itemId]), [
    ['owed', 'src-abebe:owed:2026-12'],
  ]);
});

test('no alerts when the card is topped up and nothing is owed', () => {
  const a = computeMoneyAlerts(
    base('2026-11-07', {
      sources: [{ ...card, expiresOn: '2027-06-30' }, friend],
      transactions: [
        { id: 't1', workspaceId: 'ws', sourceId: 'src-grey', kind: 'top_up', happenedOn: '2026-11-01', amount: 100, note: '', createdAt: '' },
        { id: 't2', workspaceId: 'ws', sourceId: 'src-abebe', kind: 'repayment', happenedOn: '2026-11-02', amount: 25, note: '', createdAt: '' },
      ],
    })
  );
  assert.deepEqual(a, []);
});

test('expiry is only reported for cards that still pay for something', () => {
  const a = computeMoneyAlerts(base('2026-11-07', { services: [], payments: [] }));
  assert.deepEqual(a, []);
});
