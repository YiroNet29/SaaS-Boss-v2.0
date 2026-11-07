import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convert,
  crossedRenewals,
  daysUntilExpiry,
  endOfMonth,
  planTopUp,
  renewalPaymentId,
  summarizeSource,
  upcomingCharges,
} from './ledger';
import type { Payment, PaymentSource, ServiceLink, SourceTransaction } from '../types';

const card: PaymentSource = {
  id: 'src-grey', workspaceId: 'ws', name: 'Grey USD', kind: 'card', currency: 'USD', prepaid: true,
  openingBalance: 50, last4: '4821', expiresOn: '2026-11-30', notes: '', archived: false, createdAt: '',
};
const friend: PaymentSource = { ...card, id: 'src-abebe', name: 'Abebe (USA)', kind: 'person', prepaid: false, openingBalance: 0, last4: undefined, expiresOn: undefined };
const pay = (over: Partial<Payment>): Payment => ({ id: 'p', workspaceId: 'ws', paidOn: '2026-11-01', amount: 20, currency: 'USD', origin: 'manual', note: '', createdAt: '', ...over });
const tx = (over: Partial<SourceTransaction>): SourceTransaction => ({ id: 't', workspaceId: 'ws', sourceId: 'src-grey', kind: 'top_up', happenedOn: '2026-11-01', amount: 100, note: '', createdAt: '', ...over });
const svc = (over: Partial<ServiceLink>): ServiceLink => ({
  id: 's', workspaceId: 'ws', productId: 'p', environmentType: 'production', category: 'hosting', providerName: 'Vercel',
  accountEmail: '', loginUrl: '', plan: '', billingCycle: 'monthly', cost: 20, currency: 'USD', autoRenew: true,
  paymentMethodLabel: '', notes: '', status: 'active', vaultRefs: [], createdAt: '', paymentSourceId: 'src-grey', ...over,
});

test('renewal payment ids are stable per service and cycle', () => {
  assert.equal(renewalPaymentId('srv-1', '2026-11-07'), 'pay-srv-1-20261107');
});

test('convert between USD and ETB', () => {
  assert.equal(convert(20, 'USD', 'ETB', 150), 3000);
  assert.equal(convert(3000, 'ETB', 'USD', 150), 20);
  assert.equal(convert(5, 'USD', 'USD', 150), 5);
});

test('prepaid card balance: opening + top-ups + adjustments - charges (ETB charges converted)', () => {
  const s = summarizeSource(
    card,
    [pay({ sourceId: 'src-grey', amount: 20 }), pay({ sourceId: 'src-grey', amount: 1500, currency: 'ETB' }), pay({ sourceId: 'other', amount: 999 })],
    [tx({ amount: 100 }), tx({ kind: 'adjustment', amount: -5 })],
    150
  );
  assert.deepEqual(s, { balance: 115, paidTotal: 30, topUps: 100, repaid: 0 });
});

test('person: what you owe = what they paid - your repayments', () => {
  const s = summarizeSource(
    friend,
    [pay({ sourceId: 'src-abebe', amount: 20 }), pay({ sourceId: 'src-abebe', amount: 25 })],
    [tx({ sourceId: 'src-abebe', kind: 'repayment', amount: 30 })],
    150
  );
  assert.equal(s.balance, 15);
  assert.equal(s.repaid, 30);
});

test('upcoming charges: only this source, active, within window, sorted, converted', () => {
  const c = upcomingCharges(
    card,
    [
      svc({ id: 'a', providerName: 'Vercel', renewalDate: '2026-11-12', cost: 20 }),
      svc({ id: 'b', providerName: 'Neon', renewalDate: '2026-11-08', cost: 19 }),
      svc({ id: 'c', providerName: 'Telebirr SMS', renewalDate: '2026-11-20', cost: 1500, currency: 'ETB' }),
      svc({ id: 'd', renewalDate: '2026-12-20' }), // beyond 30 days
      svc({ id: 'e', renewalDate: '2026-11-10', paymentSourceId: 'src-abebe' }),
      svc({ id: 'f', renewalDate: '2026-11-10', status: 'cancelled' }),
      svc({ id: 'g', renewalDate: '2026-11-01' }), // past
    ],
    '2026-11-06',
    150
  );
  assert.deepEqual(c.map((x) => [x.serviceId, x.amount, x.daysDiff]), [['b', 19, 2], ['a', 20, 6], ['c', 10, 14]]);
});

test('top-up plan: first charge that would fail, amount rounded up, honours low-balance floor', () => {
  const charges = [
    { serviceId: 'b', name: 'Neon', date: '2026-11-08', daysDiff: 2, amount: 19 },
    { serviceId: 'a', name: 'Vercel', date: '2026-11-12', daysDiff: 6, amount: 20 },
    { serviceId: 'c', name: 'SMS', date: '2026-11-20', daysDiff: 14, amount: 10 },
  ];
  assert.deepEqual(planTopUp(100, charges), { needed: 0, balanceAfter: 51 });
  const p = planTopUp(30.5, charges);
  assert.equal(p.needed, 19); // 30.5 - 49 = -18.5 -> 19
  assert.equal(p.by, '2026-11-12');
  assert.equal(p.firstShortCharge?.name, 'Vercel');
  const withFloor = planTopUp(30.5, charges, 10);
  assert.equal(withFloor.needed, 29);
  assert.equal(withFloor.by, '2026-11-12'); // 30.5 - 19 = 11.5 is still above the floor
});

test('card expiry helpers', () => {
  assert.equal(endOfMonth('2027-02'), '2027-02-28');
  assert.equal(endOfMonth('2028-02'), '2028-02-29');
  assert.equal(daysUntilExpiry(card, '2026-11-06'), 24);
  assert.equal(daysUntilExpiry(friend, '2026-11-06'), null);
});

test('crossedRenewals lists each charge an auto-renewal moved past', () => {
  assert.deepEqual(crossedRenewals('2026-08-10', '2026-11-10', 'monthly'), ['2026-08-10', '2026-09-10', '2026-10-10']);
  assert.deepEqual(crossedRenewals('2026-11-04', '2026-12-04', 'monthly'), ['2026-11-04']);
  assert.deepEqual(crossedRenewals('2025-03-01', '2027-03-01', 'yearly'), ['2025-03-01', '2026-03-01']);
  assert.deepEqual(crossedRenewals('2026-01-31', '2026-04-30', 'monthly', 31), ['2026-01-31', '2026-02-28', '2026-03-31']);
  assert.deepEqual(crossedRenewals('2026-01-01', '2026-02-01', 'one-time'), []);
});
