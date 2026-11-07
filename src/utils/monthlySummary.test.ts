import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlyMessage, changeLine, isMonth, monthName, shiftMonth, summarizeMonth, type MonthlyInput } from './monthlySummary';
import type { Payment, PaymentSource, ServiceLink } from '../types';

const svc = (over: Partial<ServiceLink>): ServiceLink => ({
  id: 's', workspaceId: 'ws', productId: 'p-boss', environmentType: 'production', category: 'hosting', providerName: 'Vercel',
  accountEmail: '', loginUrl: '', plan: '', billingCycle: 'monthly', cost: 20, currency: 'USD', autoRenew: true,
  paymentMethodLabel: '', notes: '', status: 'active', vaultRefs: [], createdAt: '', ...over,
});
const src = (id: string, name: string): PaymentSource => ({
  id, workspaceId: 'ws', name, kind: 'card', currency: 'USD', prepaid: true, openingBalance: 0, notes: '', archived: false, createdAt: '',
});
let n = 0;
const pay = (over: Partial<Payment>): Payment => ({
  id: `p${n++}`, workspaceId: 'ws', paidOn: '2026-10-05', amount: 20, currency: 'USD', origin: 'manual', note: '', createdAt: '', ...over,
});

const input = (): MonthlyInput => ({
  etbPerUsd: 150,
  products: [{ id: 'p-boss', name: 'SaaS Boss' }, { id: 'p-mart', name: 'MiniMart' }],
  sources: [src('grey', 'Grey'), src('abebe', 'Abebe')],
  services: [
    svc({ id: 'vercel', providerName: 'Vercel', renewalDate: '2026-11-05' }),
    svc({ id: 'neon', providerName: 'Neon', productId: 'p-mart', cost: 19, renewalDate: '2026-11-10' }),
    svc({ id: 'telebirr', providerName: 'Chapa', productId: 'p-mart', cost: 1950, currency: 'ETB', renewalDate: '2026-11-20' }),
    svc({ id: 'domain', providerName: 'Namecheap', billingCycle: 'yearly', cost: 12, renewalDate: '2027-03-01' }),
    svc({ id: 'old', providerName: 'Heroku', status: 'cancelled', renewalDate: '2026-11-02' }),
  ],
  payments: [
    pay({ serviceLinkId: 'vercel', sourceId: 'grey', amount: 20, etbPaid: 3200, receiptId: 'r1' }),
    pay({ serviceLinkId: 'vercel', sourceId: 'grey', amount: 20, paidOn: '2026-10-20' }),
    pay({ serviceLinkId: 'neon', sourceId: 'abebe', amount: 19, paidOn: '2026-10-10' }),
    pay({ serviceLinkId: 'telebirr', amount: 1950, currency: 'ETB', paidOn: '2026-10-31' }),
    pay({ amount: 15, note: 'Figma · Pro plan', paidOn: '2026-10-07', sourceId: 'gone' }),
    pay({ serviceLinkId: 'vercel', sourceId: 'grey', paidOn: '2026-09-05', amount: 20 }),
    pay({ serviceLinkId: 'neon', sourceId: 'abebe', paidOn: '2026-09-10', amount: 19 }),
    pay({ serviceLinkId: 'vercel', paidOn: '2026-11-01', amount: 20 }), // next month: not counted
  ],
});

test('month helpers', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(monthName('2026-10'), 'October 2026');
  assert.equal(isMonth('2026-10'), true);
  assert.equal(isMonth('2026-13'), false);
  assert.equal(isMonth('Oct'), false);
});

test('October: totals, birr, breakdowns, receipts, what is due next', () => {
  const s = summarizeMonth(input(), '2026-10');
  assert.equal(s.count, 5);
  assert.equal(s.totalUsd, 20 + 20 + 19 + 13 + 15); // 1950 ETB = $13 at 150
  assert.equal(s.totalEtb, 3200 + 3000 + 2850 + 1950 + 2250); // real birr where known, estimated otherwise
  assert.equal(s.etbEstimated, true);
  assert.equal(s.previousUsd, 39);
  assert.deepEqual(s.byProduct, [
    { name: 'SaaS Boss', usd: 40, count: 2 },
    { name: 'MiniMart', usd: 32, count: 2 },
    { name: 'Not linked to a service', usd: 15, count: 1 },
  ]);
  assert.deepEqual(s.bySource.map((r) => [r.name, r.usd]), [['Grey', 40], ['Abebe', 19], ['Removed card', 15], ['Not set', 13]]);
  assert.deepEqual(s.topServices.map((r) => r.name), ['Vercel', 'Neon', 'Figma', 'Chapa']);
  assert.equal(s.withoutReceipt, 4);
  // November: Vercel, Neon, Chapa (the cancelled one and the yearly domain in March don't count).
  assert.deepEqual(s.upcoming, { month: '2026-11', count: 3, usd: 52 });
});

test('the message', () => {
  const s = summarizeMonth(input(), '2026-10');
  assert.equal(changeLine(s), '▲ 123% vs September ($39)');
  const m = buildMonthlyMessage(s, 'Yiro <Studio>', { includeUpcoming: true });
  assert.equal(m.title, 'October 2026 · Yiro <Studio>');
  assert.match(m.html, /^📊 <b>October 2026 · Yiro &lt;Studio&gt;<\/b>/);
  assert.match(m.html, /Spent \$87 \(≈ ETB 13,250\) on 5 payments/);
  assert.match(m.html, /<b>By product<\/b>\n• SaaS Boss: \$40\n• MiniMart: \$32/);
  assert.match(m.html, /<b>Paid with<\/b>\n• Grey: \$40/);
  assert.match(m.html, /<b>Biggest<\/b>\n1\. Vercel \$40\n2\. Neon \$19/);
  assert.match(m.html, /🧾 4 payments have no receipt yet\./);
  assert.match(m.html, /📅 Coming up in November: 3 renewals, about \$52\./);
  assert.deepEqual(m.plain.slice(0, 3), ['Spent $87 (≈ ETB 13,250) on 5 payments', '▲ 123% vs September ($39)', 'By product:']);
  assert.ok(!buildMonthlyMessage(s, 'x').html.includes('Coming up'), 'upcoming only when asked');
});

test('a quiet month', () => {
  const s = summarizeMonth(input(), '2026-08');
  assert.equal(s.count, 0);
  assert.equal(changeLine(s), null);
  const m = buildMonthlyMessage(s, 'Yiro');
  assert.match(m.html, /No payments recorded\./);
  assert.ok(!m.html.includes('By product'));
});
