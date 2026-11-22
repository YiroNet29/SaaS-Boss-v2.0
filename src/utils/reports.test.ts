import test from 'node:test';
import assert from 'node:assert/strict';
import { monthPaymentsCsv, paidInLastYear } from './reports';
import type { Payment, PaymentSource, Product, Receipt, ServiceLink } from '../types';

const pay = (o: Partial<Payment>): Payment =>
  ({ id: 'p', workspaceId: 'w', paidOn: '2026-10-05', amount: 20, currency: 'USD', origin: 'manual', note: '', createdAt: '2026-10-05', ...o }) as Payment;
const services = [{ id: 's1', productId: 'a', providerName: 'Vercel' }, { id: 's2', productId: 'a', providerName: 'Ethio, "telecom"' }] as ServiceLink[];
const products = [{ id: 'a', name: 'SaaS Boss' }] as Product[];
const sources = [{ id: 'grey', name: 'Grey' }] as PaymentSource[];

test('paid in the last year: only these services, the last 12 months, birr converted', () => {
  const payments = [
    pay({ id: '1', serviceLinkId: 's1', paidOn: '2026-11-01', amount: 20 }),
    pay({ id: '2', serviceLinkId: 's2', paidOn: '2026-06-01', amount: 1550, currency: 'ETB' }),
    pay({ id: '3', serviceLinkId: 's1', paidOn: '2025-11-22', amount: 20 }), // exactly a year ago: not counted
    pay({ id: '4', serviceLinkId: 'other', paidOn: '2026-10-01', amount: 99 }),
    pay({ id: '5', serviceLinkId: 's1', paidOn: '2026-10-01', amount: 20, etbPaid: 3300 }),
  ];
  const r = paidInLastYear(payments, new Set(['s1', 's2']), 155, '2026-11-22');
  assert.deepEqual(r, { usd: 50, etb: 20 * 155 + 1550 + 3300, count: 3 });
});

test('month CSV: that month only, oldest first, names filled in, commas and quotes escaped', () => {
  const payments = [
    pay({ id: 'b', serviceLinkId: 's2', paidOn: '2026-10-20', amount: 1550, currency: 'ETB', origin: 'receipt', receiptId: 'r1', note: 'Domain, yearly' }),
    pay({ id: 'a', serviceLinkId: 's1', paidOn: '2026-10-03', sourceId: 'grey', etbPaid: 3300, origin: 'telegram' }),
    pay({ id: 'c', serviceLinkId: 's1', paidOn: '2026-11-03' }),
  ];
  const receipts = [{ id: 'r1', extracted: { vendor: 'Ethio telecom' } }] as unknown as Receipt[];
  const { csv, count } = monthPaymentsCsv({ month: '2026-10', payments, services, products, sources, receipts });
  assert.equal(count, 2);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'Date,Service,App,Paid with,Amount,Currency,Cost in birr,How,Receipt,Note');
  assert.equal(lines[1], '2026-10-03,Vercel,SaaS Boss,Grey,20.00,USD,3300,Telegram,,');
  assert.equal(lines[2], '2026-10-20,"Ethio, ""telecom""",SaaS Boss,,1550.00,ETB,,Receipt,Ethio telecom,"Domain, yearly"');
});
