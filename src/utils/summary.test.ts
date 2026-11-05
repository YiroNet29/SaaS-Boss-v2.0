import test from 'node:test';
import assert from 'node:assert/strict';
import { relativeDays, summarizeUpcoming } from './summary';
import type { ServiceLink } from '../types';
import type { DomainExpiryItem } from './domainExpiry';

const svc = (over: Partial<ServiceLink>): ServiceLink => ({
  id: 's', workspaceId: 'ws', productId: 'p', environmentType: 'production', category: 'hosting',
  providerName: 'Vercel', accountEmail: '', loginUrl: '', plan: '', billingCycle: 'monthly', cost: 20,
  currency: 'USD', autoRenew: true, paymentMethodLabel: '', notes: '', status: 'active', vaultRefs: [],
  createdAt: '2026-01-01', ...over,
});

const domain = (name: string, dueDate: string): DomainExpiryItem => ({
  id: name, domainName: name, provider: 'Namecheap', productName: 'App', dueDate, autoRenew: false,
});

test('renewals in the next 30 days: count, USD total with ETB converted, nearest first', () => {
  const s = summarizeUpcoming(
    [
      svc({ id: 'a', providerName: 'Vercel', renewalDate: '2026-11-12', cost: 20 }),
      svc({ id: 'b', providerName: 'Telebirr SMS', renewalDate: '2026-11-07', cost: 1550, currency: 'ETB' }),
      svc({ id: 'c', renewalDate: '2026-12-20' }), // outside window
      svc({ id: 'd', renewalDate: '2026-11-10', status: 'cancelled' }),
      svc({ id: 'e', renewalDate: '2026-11-10', billingCycle: 'free', cost: 0 }),
      svc({ id: 'f', renewalDate: '2026-11-01' }), // overdue, counted elsewhere
    ],
    [],
    155,
    '2026-11-05'
  );
  assert.equal(s.renewals.count, 2);
  assert.equal(Math.round(s.renewals.totalUsd * 100) / 100, 30);
  assert.deepEqual(s.renewals.next, { title: 'Telebirr SMS', daysDiff: 2 });
});

test('domains within 60 days include already expired ones', () => {
  const s = summarizeUpcoming(
    [],
    [domain('late.et', '2026-10-21'), domain('soon.io', '2026-11-20'), domain('later.com', '2027-03-01')],
    155,
    '2026-11-05'
  );
  assert.equal(s.domains.count, 2);
  assert.equal(s.domains.expired, 1);
  assert.deepEqual(s.domains.next, { title: 'late.et', daysDiff: -15 });
});

test('relativeDays reads naturally', () => {
  assert.equal(relativeDays(0), 'today');
  assert.equal(relativeDays(1), 'tomorrow');
  assert.equal(relativeDays(9), 'in 9 days');
  assert.equal(relativeDays(-4), '4 days ago');
});
