import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionsFor,
  buildReminderMessage,
  encodeAction,
  escapeHtml,
  formatDualAmount,
  markItemHandled,
  parseAction,
  type ReminderItem,
} from './telegramUi';
import { snoozeUntil } from './reminders';
import { advanceAfterPayment } from './renewals';

const item = (over: Partial<ReminderItem>): ReminderItem => ({
  itemId: 'date-1', itemType: 'importantDate', title: 'example.com expiry', dueDate: '2026-11-12',
  leadDays: [7], productName: 'SaaS Boss', daysDiff: 7, ...over,
});

test('action encoding round-trips and respects the 64-byte limit', () => {
  assert.equal(encodeAction('done', 'date-abc123', '2026-11-12'), 'done|date-abc123|20261112');
  assert.deepEqual(parseAction('done|date-abc123|20261112'), { kind: 'done', itemId: 'date-abc123', due: '2026-11-12' });
  assert.equal(encodeAction('paid', 'x'.repeat(70), '2026-11-12'), null);
  assert.equal(parseAction('drop|table|20261112'), null);
  assert.equal(parseAction('done|bad id;|20261112'), null);
  assert.equal(parseAction('done|date-1'), null); // no due date
  assert.equal(parseAction(undefined), null);
});

test('buttons: dates get done/snooze, manual renewals get paid, auto-renew and trials get none', () => {
  assert.deepEqual(actionsFor({ itemType: 'importantDate', itemId: 'd' }).map((a) => a.kind), ['done', 's3', 's7']);
  assert.deepEqual(actionsFor({ itemType: 'serviceLink', itemId: 's', autoRenew: false }).map((a) => a.kind), ['paid']);
  assert.deepEqual(actionsFor({ itemType: 'serviceLink', itemId: 's', autoRenew: true }), []);
  assert.deepEqual(actionsFor({ itemType: 'serviceLink', itemId: 's:trial', autoRenew: false }), []);
});

test('amounts are shown in both currencies', () => {
  assert.equal(formatDualAmount(20, 'USD', 157.4), '$20 (≈ ETB 3,148)');
  assert.equal(formatDualAmount(3900, 'ETB', 156), 'ETB 3,900 (≈ $25)');
  assert.equal(formatDualAmount(0, 'USD', 156), '');
});

test('message groups overdue first, numbers items, escapes HTML and adds matching buttons', () => {
  const msg = buildReminderMessage({
    workspaceName: 'Yiro <Studio>',
    etbPerUsd: 150,
    appUrl: 'https://saas-boss-v20.vercel.app',
    items: [
      item({ itemId: 'srv-vercel', itemType: 'serviceLink', title: 'Vercel renewal', daysDiff: 2, amount: 20, currency: 'USD', autoRenew: true }),
      item({ itemId: 'date-dom', title: 'minimart.et <expiry>', daysDiff: -3 }),
      item({ itemId: 'srv-namecheap', itemType: 'serviceLink', title: 'Namecheap', daysDiff: 30, amount: 3900, currency: 'ETB', autoRenew: false }),
    ],
  });
  const t = msg.text;
  assert.ok(t.includes('Yiro &lt;Studio&gt;'));
  assert.ok(t.includes('minimart.et &lt;expiry&gt;'));
  assert.ok(t.indexOf('Overdue') < t.indexOf('Coming up'));
  assert.ok(t.includes('1. <b>minimart.et'));
  assert.ok(t.includes('2. <b>Vercel renewal'));
  assert.ok(t.includes('Due within 7 days: <b>$20</b> ≈ ETB 3,000'));
  assert.ok(t.includes('<a href="https://saas-boss-v20.vercel.app">'));
  // Row for #1 (date) and #3 (manual renewal); Vercel auto-renews so it has none.
  assert.deepEqual(
    msg.reply_markup?.inline_keyboard.map((r) => r.map((b) => b.text)),
    [['✅ Done #1', '😴 3d', '😴 7d'], ['✅ Paid #3']]
  );
});

test('long lists are capped and mention the rest', () => {
  const items = Array.from({ length: 20 }, (_, i) => item({ itemId: `d${i}`, daysDiff: i }));
  const msg = buildReminderMessage({ workspaceName: 'W', items, etbPerUsd: 150, maxItems: 15 });
  assert.ok(msg.text.includes('…and 5 more in the app.'));
  assert.equal(msg.reply_markup?.inline_keyboard.length, 15);
});

test('markItemHandled replaces only the tapped item row', () => {
  const kb = { inline_keyboard: [[{ text: '✅ Done #1', callback_data: 'done|a|20261112' }, { text: '😴 3d', callback_data: 's3|a|20261112' }], [{ text: '✅ Paid #2', callback_data: 'paid|b|20261201' }]] };
  assert.deepEqual(markItemHandled(kb, 'a', '✔ Done')?.inline_keyboard, [
    [{ text: '✔ Done', callback_data: 'noop' }],
    [{ text: '✅ Paid #2', callback_data: 'paid|b|20261201' }],
  ]);
});

test('snoozeUntil counts from today for overdue items, from the due date for future ones', () => {
  assert.equal(snoozeUntil('2026-10-21', '2026-11-05', 3), '2026-11-08');
  assert.equal(snoozeUntil('2026-11-20', '2026-11-05', 3), '2026-11-23');
  assert.equal(snoozeUntil(undefined, '2026-11-05', 7), '2026-11-12');
});

test('advanceAfterPayment moves a paid renewal to the next cycle, never into the past', () => {
  assert.equal(advanceAfterPayment('2026-11-06', 'monthly', '2026-11-05'), '2026-12-06'); // paid early
  assert.equal(advanceAfterPayment('2026-11-05', 'yearly', '2026-11-05'), '2027-11-05'); // paid on the day
  assert.equal(advanceAfterPayment('2026-09-10', 'monthly', '2026-11-05'), '2026-11-10'); // paid late
  assert.equal(advanceAfterPayment('2026-11-05', 'one-time', '2026-11-05'), null);
});

test('escapeHtml', () => {
  assert.equal(escapeHtml('a < b & c > d'), 'a &lt; b &amp; c &gt; d');
});
