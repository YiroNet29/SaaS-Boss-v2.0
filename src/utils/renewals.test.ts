import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonthsAnchored, computeRollForwards, nextRenewalDate } from './renewals';
import type { ServiceLink } from '../types';

test('addMonthsAnchored clamps month ends and returns to the anchor day', () => {
  assert.equal(addMonthsAnchored('2026-01-31', 1, 31), '2026-02-28');
  assert.equal(addMonthsAnchored('2026-01-31', 2, 31), '2026-03-31');
  assert.equal(addMonthsAnchored('2028-01-31', 1, 31), '2028-02-29'); // leap year
  assert.equal(addMonthsAnchored('2026-11-15', 2, 15), '2027-01-15'); // year boundary
});

test('nextRenewalDate leaves today and future dates alone', () => {
  assert.equal(nextRenewalDate('2026-11-05', 'monthly', '2026-11-05'), null);
  assert.equal(nextRenewalDate('2026-12-01', 'monthly', '2026-11-05'), null);
});

test('nextRenewalDate moves past dates forward by whole cycles', () => {
  assert.equal(nextRenewalDate('2026-11-04', 'monthly', '2026-11-05'), '2026-12-04');
  assert.equal(nextRenewalDate('2026-07-10', 'monthly', '2026-11-05'), '2026-11-10'); // skipped several months
  assert.equal(nextRenewalDate('2025-03-01', 'yearly', '2026-11-05'), '2027-03-01');
  assert.equal(nextRenewalDate('2026-10-28', 'usage-based', '2026-11-05'), '2026-11-28');
});

test('nextRenewalDate keeps the anchor day across short months', () => {
  assert.equal(nextRenewalDate('2026-01-31', 'monthly', '2026-02-10'), '2026-02-28');
  // Renewal already clamped to Feb 28, but the service really renews on the 31st (start date).
  assert.equal(nextRenewalDate('2026-02-28', 'monthly', '2026-03-01', 31), '2026-03-31');
});

test('nextRenewalDate never moves one-time or free services', () => {
  assert.equal(nextRenewalDate('2026-01-01', 'one-time', '2026-11-05'), null);
  assert.equal(nextRenewalDate('2026-01-01', 'free', '2026-11-05'), null);
});

const svc = (over: Partial<ServiceLink>): ServiceLink => ({
  id: 's', workspaceId: 'ws', productId: 'p', environmentType: 'production', category: 'hosting',
  providerName: 'Vercel', accountEmail: '', loginUrl: '', plan: 'Pro', billingCycle: 'monthly', cost: 20,
  currency: 'USD', autoRenew: true, paymentMethodLabel: '', notes: '', status: 'active', vaultRefs: [],
  createdAt: '2026-01-01', renewalDate: '2026-11-01', ...over,
});

test('computeRollForwards only touches active auto-renewing services', () => {
  const result = computeRollForwards(
    [
      svc({ id: 'a' }),
      svc({ id: 'manual', autoRenew: false }),
      svc({ id: 'paused', status: 'paused' }),
      svc({ id: 'trial', status: 'trial' }),
      svc({ id: 'nodate', renewalDate: undefined }),
      svc({ id: 'future', renewalDate: '2026-12-01' }),
      svc({ id: 'anchored', renewalDate: '2026-02-28', startDate: '2025-12-31', billingCycle: 'monthly' }),
    ],
    '2026-11-05'
  );
  assert.deepEqual(
    result.map((r) => [r.id, r.to]),
    [
      ['a', '2026-12-01'],
      ['anchored', '2026-11-30'],
    ]
  );
});
