import test from 'node:test';
import assert from 'node:assert/strict';
import { priceChanges } from './priceChanges';
import type { Payment, ServiceLink } from '../types';

const svc = (o: Partial<ServiceLink>): ServiceLink =>
  ({ id: 's', productId: 'p', providerName: 'Vercel', cost: 20, currency: 'USD', billingCycle: 'monthly', status: 'active', ...o }) as ServiceLink;
const pay = (o: Partial<Payment>): Payment =>
  ({ id: Math.random().toString(36), workspaceId: 'w', serviceLinkId: 's', paidOn: '2026-11-01', amount: 20, currency: 'USD', origin: 'manual', note: '', createdAt: '2026-11-01T00:00:00Z', ...o }) as Payment;

test('price changes: the latest payment differing from the listed price is flagged', () => {
  const r = priceChanges([svc({})], [pay({ paidOn: '2026-10-01', amount: 20 }), pay({ paidOn: '2026-11-01', amount: 24 })]);
  assert.deepEqual(r.get('s'), { serviceId: 's', listed: 20, charged: 24, currency: 'USD', paidOn: '2026-11-01' });
});

test('price changes: same price, small rounding, other currency, usage-based or cancelled are not flagged', () => {
  assert.equal(priceChanges([svc({})], [pay({ amount: 20 })]).size, 0);
  assert.equal(priceChanges([svc({})], [pay({ amount: 20.3 })]).size, 0); // under 0.50
  assert.equal(priceChanges([svc({ cost: 3900, currency: 'ETB' })], [pay({ amount: 3950, currency: 'ETB' })]).size, 0); // under 2%
  assert.equal(priceChanges([svc({})], [pay({ amount: 3100, currency: 'ETB' })]).size, 0);
  assert.equal(priceChanges([svc({ billingCycle: 'usage-based' })], [pay({ amount: 31 })]).size, 0);
  assert.equal(priceChanges([svc({ status: 'cancelled' })], [pay({ amount: 31 })]).size, 0);
  assert.equal(priceChanges([svc({})], [pay({ amount: 31, paidOn: '2026-10-01' }), pay({ amount: 20, paidOn: '2026-11-01' })]).size, 0); // back to normal
});
