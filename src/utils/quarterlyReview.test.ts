import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewMessage, MAX_REVIEW_ITEMS, quarterOf, reviewWeek, servicesToReview } from './quarterlyReview';
import { parseAction } from './telegramUi';
import type { ServiceLink } from '../types';

const svc = (o: Partial<ServiceLink>): ServiceLink =>
  ({ id: 's', productId: 'p', providerName: 'Vercel', plan: '', cost: 20, currency: 'USD', billingCycle: 'monthly', status: 'active', ...o }) as ServiceLink;

test('quarterly check: quarters and the week it is asked', () => {
  assert.deepEqual(quarterOf('2026-11-22'), { key: '2026-Q4', start: '2026-10-01' });
  assert.deepEqual(quarterOf('2027-01-01'), { key: '2027-Q1', start: '2027-01-01' });
  assert.deepEqual(quarterOf('2027-06-30'), { key: '2027-Q2', start: '2027-04-01' });
  assert.equal(reviewWeek('2027-01-01'), true);
  assert.equal(reviewWeek('2027-04-07'), true);
  assert.equal(reviewWeek('2027-04-08'), false);
  assert.equal(reviewWeek('2027-02-01'), false);
  assert.equal(reviewWeek('2026-11-22'), false);
});

test('quarterly check: only active, paid, repeating services; priciest first (birr converted)', () => {
  const list = servicesToReview(
    [
      svc({ id: 'small', providerName: 'Resend', cost: 5 }),
      svc({ id: 'birr', providerName: 'Ethio Telecom', cost: 3000, currency: 'ETB' }), // $20 at 150
      svc({ id: 'yearly', providerName: 'Namecheap', cost: 120, billingCycle: 'yearly' }), // $10 a month
      svc({ id: 'big', providerName: 'Supabase', cost: 25 }),
      svc({ id: 'free', providerName: 'Cloudflare', cost: 0, billingCycle: 'free' }),
      svc({ id: 'usage', providerName: 'OpenAI', cost: 30, billingCycle: 'usage-based' }),
      svc({ id: 'once', providerName: 'Logo', cost: 300, billingCycle: 'one-time' }),
      svc({ id: 'gone', providerName: 'Heroku', status: 'cancelled' }),
      svc({ id: 'trial', providerName: 'Clerk', status: 'trial' }),
      svc({ id: 'paused', providerName: 'Render', status: 'paused' }),
    ],
    150
  );
  assert.deepEqual(list.map((s) => s.id), ['big', 'birr', 'yearly', 'small']);
});

test('quarterly check: message with Keep and Cancel per service', () => {
  const services = Array.from({ length: MAX_REVIEW_ITEMS + 2 }, (_, i) => svc({ id: `s${i}`, providerName: `Tool <${i}>`, plan: i === 0 ? 'Pro' : '' }));
  const msg = buildReviewMessage({
    workspaceName: 'Yiro & Co',
    services,
    productNames: new Map([['p', 'SaaS Boss']]),
    etbPerUsd: 150,
    quarterStart: '2026-10-01',
  });
  assert.match(msg.text, /Quarterly check · Yiro &amp; Co/);
  assert.match(msg.text, /1\. <b>Tool &lt;0&gt; \(Pro\)<\/b> · SaaS Boss\n {4}\$20 \(≈ ETB 3,000\) a month/);
  assert.match(msg.text, /…and 2 smaller ones in the app\./);
  const rows = msg.reply_markup!.inline_keyboard;
  assert.equal(rows.length, MAX_REVIEW_ITEMS);
  assert.deepEqual(rows[0].map((b) => b.text), ['✅ Keep #1', '🛑 Cancel #1']);
  assert.deepEqual(parseAction(rows[0][1].callback_data), { kind: 'stop', itemId: 's0', due: '2026-10-01' });
  assert.equal(msg.plain[0], 'Tool <0> (Pro) · SaaS Boss: $20 (≈ ETB 3,000) a month');
});

test('quarterly check: long names are shortened; the message carries no link of its own', () => {
  const msg = buildReviewMessage({
    workspaceName: 'W',
    services: [svc({ providerName: 'X'.repeat(200) })],
    productNames: new Map([['p', 'A'.repeat(100)]]),
    etbPerUsd: 150,
    quarterStart: '2026-10-01',
  });
  assert.ok(msg.text.includes(`${'X'.repeat(59)}…`));
  assert.ok(msg.text.includes(`${'A'.repeat(39)}…`));
  assert.ok(!msg.text.includes('Open StackTrack'), 'the sender adds the link once');
});
