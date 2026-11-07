import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanDetails,
  describePlan,
  looksLikeReceiptText,
  normalizeCurrency,
  parseAmount,
  parseReceiptText,
  planReceiptPayment,
  receiptHeadline,
  receiptMimeType,
  suggestMatch,
  vendorScore,
} from './receipts';
import type { Payment, PaymentSource, ServiceLink } from '../types';

const svc = (over: Partial<ServiceLink>): ServiceLink => ({
  id: 's', workspaceId: 'ws', productId: 'p', environmentType: 'production', category: 'hosting', providerName: 'Vercel',
  accountEmail: '', loginUrl: '', plan: '', billingCycle: 'monthly', cost: 20, currency: 'USD', autoRenew: false,
  paymentMethodLabel: '', notes: '', status: 'active', vaultRefs: [], createdAt: '', ...over,
});
const grey: PaymentSource = {
  id: 'src-grey', workspaceId: 'ws', name: 'Grey', kind: 'card', currency: 'USD', prepaid: true, openingBalance: 30,
  last4: '4821', notes: '', archived: false, createdAt: '',
};
const pay = (over: Partial<Payment>): Payment => ({
  id: 'p1', workspaceId: 'ws', paidOn: '2026-11-05', amount: 20, currency: 'USD', origin: 'auto_renew', note: '', createdAt: '', ...over,
});

test('amounts and currencies as they appear on receipts', () => {
  assert.equal(parseAmount('1,234.56'), 1234.56);
  assert.equal(parseAmount('1.234,56'), 1234.56);
  assert.equal(parseAmount('20,00'), 20);
  assert.equal(parseAmount('1,250'), 1250);
  assert.equal(parseAmount('$20'), 20);
  assert.equal(normalizeCurrency('$'), 'USD');
  assert.equal(normalizeCurrency('US$'), 'USD');
  assert.equal(normalizeCurrency('Br.'), 'ETB');
  assert.equal(normalizeCurrency('birr'), 'ETB');
  assert.equal(normalizeCurrency('€'), 'EUR');
  assert.equal(normalizeCurrency('cad'), 'CAD');
  assert.equal(normalizeCurrency('dollars and cents'), undefined);
});

test('cleanDetails keeps only valid values', () => {
  const d = cleanDetails({
    isReceipt: true, vendor: '  Vercel   Inc. ', amount: '20.004', currency: 'usd', date: '2026-11-05',
    periodStart: '2026-02-30', cardLast4: '**** 4821', summary: 'Pro plan', readBy: 'claude', junk: 'x',
  });
  assert.deepEqual(d, { isReceipt: true, vendor: 'Vercel Inc.', amount: 20, currency: 'USD', date: '2026-11-05', cardLast4: '4821', summary: 'Pro plan', readBy: 'claude' });
  assert.deepEqual(cleanDetails({ amount: -5, date: 'yesterday', cardLast4: '12' }), {});
  assert.deepEqual(cleanDetails(null), {});
});

test('file types: from the sender, or from the file name', () => {
  assert.equal(receiptMimeType('image/jpg'), 'image/jpeg');
  assert.equal(receiptMimeType('application/octet-stream', 'Invoice-123.PDF'), 'application/pdf');
  assert.equal(receiptMimeType(undefined, 'photo.heic'), 'image/heic');
  assert.equal(receiptMimeType('application/zip', 'x.zip'), null);
});

test('plain-text reader: a forwarded Vercel receipt', () => {
  const text = [
    '---------- Forwarded message ---------',
    'From: Vercel Billing <billing@vercel.com>',
    'Date: Thu, Nov 5, 2026 at 9:12 AM',
    'Subject: Your receipt from Vercel Inc. #2231-9981',
    '',
    'Pro plan (Nov 5, 2026 – Dec 5, 2026)   $20.00',
    'Subtotal  $20.00',
    'Tax       $1.60',
    'Total     $21.60',
    'Amount paid  $21.60',
    'Visa ending in 4821',
  ].join('\n');
  const d = parseReceiptText(text);
  assert.deepEqual(d, { readBy: 'text', amount: 21.6, currency: 'USD', date: '2026-11-05', cardLast4: '4821', vendor: 'Vercel', isReceipt: true });
});

test('plain-text reader: birr amounts, day-month dates, vendor from the sentence', () => {
  const d = parseReceiptText('Payment to Ethio Telecom. You paid 1,250.00 ETB on 3 November 2026. Card ****7701');
  assert.equal(d.amount, 1250);
  assert.equal(d.currency, 'ETB');
  assert.equal(d.date, '2026-11-03');
  assert.equal(d.cardLast4, '7701');
  assert.equal(d.vendor, 'Ethio Telecom');
});

test('plain-text reader: no amount means "not a receipt"', () => {
  const d = parseReceiptText('Hi, are we still meeting tomorrow?');
  assert.equal(d.isReceipt, false);
  assert.equal(d.amount, undefined);
});

test('which Telegram texts are treated as receipts', () => {
  assert.equal(looksLikeReceiptText('hi', false), false);
  assert.equal(looksLikeReceiptText('/due', true), false);
  assert.equal(looksLikeReceiptText('anything', true), true);
  assert.equal(looksLikeReceiptText('Your Neon invoice for November: $19.00 charged to card', false), true);
  assert.equal(looksLikeReceiptText('can you remind me about the domain next week please', false), false);
});

test('vendor names match despite suffixes and plan names', () => {
  assert.equal(vendorScore('Vercel Inc.', 'Vercel'), 1);
  assert.equal(vendorScore('Amazon Web Services', 'AWS'), 1);
  assert.equal(vendorScore('Supabase Pro', 'Supabase'), 0.85);
  assert.equal(vendorScore('Neon', 'Netlify'), 0);
  assert.equal(vendorScore('', 'Vercel'), 0);
});

test('suggestMatch: vendor first, then amount and card break ties', () => {
  const services = [
    svc({ id: 'v-a', providerName: 'Vercel', cost: 20 }),
    svc({ id: 'v-b', providerName: 'Vercel', cost: 20, paymentSourceId: 'src-grey' }),
    svc({ id: 'neon', providerName: 'Neon', cost: 19 }),
  ];
  assert.deepEqual(suggestMatch({ vendor: 'Vercel Inc.', amount: 20, currency: 'USD', cardLast4: '4821' }, services, [grey]), {
    serviceId: 'v-b', sourceId: 'src-grey', score: 1.5,
  });
  // Tax makes it a bit higher: still matched; the card comes from the service.
  assert.equal(suggestMatch({ vendor: 'Neon', amount: 21.5, currency: 'USD' }, services, [grey]).serviceId, 'neon');
  // Unknown vendor: no service, but the card is still recognised.
  assert.deepEqual(suggestMatch({ vendor: 'Figma', cardLast4: '4821' }, services, [grey]), { serviceId: undefined, sourceId: 'src-grey', score: 0 });
});

test('plan: attach to an auto-renewal payment already recorded for that charge', () => {
  const s = svc({ id: 'vercel', autoRenew: true, renewalDate: '2026-12-05' });
  const plan = planReceiptPayment({
    receiptId: 'rcpt-1', date: '2026-11-06', service: s, today: '2026-11-07',
    payments: [pay({ id: 'pay-vercel-20261105', serviceLinkId: 'vercel', paidOn: '2026-11-05' }), pay({ id: 'old', serviceLinkId: 'vercel', paidOn: '2026-10-05' })],
  });
  assert.deepEqual(plan, { kind: 'attach', paymentId: 'pay-vercel-20261105', paidOn: '2026-11-05' });
  assert.equal(describePlan(plan, 'Vercel'), 'Adds this receipt to the Vercel payment on 2026-11-05');
});

test('plan: pay the current renewal (same id as "Mark paid"), and move the date on', () => {
  const s = svc({ id: 'neon', providerName: 'Neon', renewalDate: '2026-11-10', startDate: '2026-01-31' });
  const plan = planReceiptPayment({ receiptId: 'rcpt-2', date: '2026-11-07', service: s, payments: [], today: '2026-11-07' });
  assert.deepEqual(plan, { kind: 'renewal', paymentId: 'pay-neon-20261110', due: '2026-11-10', next: '2026-12-31' });
  assert.match(describePlan(plan, 'Neon'), /renewal due 2026-11-10 paid · next renewal 2026-12-31/);
});

test('plan: a payment that already has another receipt is left alone', () => {
  const s = svc({ id: 'neon', renewalDate: '2026-11-10' });
  const payments = [pay({ id: 'pay-neon-20261110', serviceLinkId: 'neon', paidOn: '2026-11-10', receiptId: 'rcpt-other' })];
  assert.deepEqual(planReceiptPayment({ receiptId: 'rcpt-3', date: '2026-11-08', service: s, payments, today: '2026-11-08' }), {
    kind: 'new', paymentId: 'pay-rcpt-3',
  });
  // ...but the receipt that is attached can be confirmed again without creating anything new.
  assert.equal(planReceiptPayment({ receiptId: 'rcpt-other', date: '2026-11-08', service: s, payments, today: '2026-11-08' }).kind, 'attach');
});

test('plan: no service or far from any renewal → a new payment', () => {
  assert.deepEqual(planReceiptPayment({ receiptId: 'r', date: '2026-11-07', payments: [], today: '2026-11-07' }), { kind: 'new', paymentId: 'pay-r' });
  const s = svc({ id: 'x', renewalDate: '2027-03-01', billingCycle: 'yearly' });
  assert.equal(planReceiptPayment({ receiptId: 'r', date: '2026-11-07', service: s, payments: [], today: '2026-11-07' }).kind, 'new');
  assert.equal(describePlan({ kind: 'new', paymentId: 'p' }), 'Records a new payment (not linked to a service)');
});

test('headline', () => {
  assert.equal(receiptHeadline({ vendor: 'Vercel', amount: 21.6, currency: 'USD', date: '2026-11-05' }), 'Vercel · $21.60 · 2026-11-05');
  assert.equal(receiptHeadline({ amount: 18, currency: 'EUR' }), 'Unknown vendor · EUR 18');
});
