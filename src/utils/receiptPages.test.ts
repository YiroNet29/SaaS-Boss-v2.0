import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Receipt, ReceiptStatus } from '../types';
import {
  doneByApp,
  doneByMonth,
  missingReceiptsByApp,
  monthLabel,
  monthSummary,
  newestFirst,
  paymentsWithoutReceipt,
  receiptMonths,
  savedInMonth,
} from './receiptPages';

const rc = (id: string, createdAt: string, status: ReceiptStatus = 'confirmed', serviceLinkId?: string): Receipt => ({
  id,
  workspaceId: 'w',
  channel: 'telegram',
  status,
  extracted: {},
  serviceLinkId,
  createdAt,
});

const services = [
  { id: 's-vercel', productId: 'p-stack', providerName: 'Vercel' },
  { id: 's-supa', productId: 'p-addis', providerName: 'Supabase' },
  { id: 's-twilio', productId: 'p-addis', providerName: 'Twilio' },
];
const products = [
  { id: 'p-stack', name: 'StackTrack' },
  { id: 'p-addis', name: 'Addis Bites' },
  { id: 'p-yg', name: 'YG Retails' },
];

describe('months', () => {
  test('month names and summaries read plainly', () => {
    assert.equal(monthLabel('2026-11'), 'November 2026');
    assert.equal(monthLabel('2027-01'), 'January 2027');
    assert.equal(monthSummary(6, 0), '6 receipts · all saved');
    assert.equal(monthSummary(1, 0), '1 receipt · saved');
    assert.equal(monthSummary(0, 2), '2 receipts · all ignored');
    assert.equal(monthSummary(4, 1), '5 receipts · 4 saved, 1 ignored');
  });

  test('done receipts group by month, newest month and newest receipt first', () => {
    const groups = doneByMonth([
      rc('a', '2026-10-03T10:00:00Z'),
      rc('b', '2026-11-15T09:00:00Z'),
      rc('c', '2026-11-09T09:00:00Z', 'ignored'),
      rc('d', '2026-11-20T09:00:00Z'),
    ]);
    assert.deepEqual(
      groups.map((g) => [g.month, g.label, g.receipts.map((r) => r.id).join(''), g.summary]),
      [
        ['2026-11', 'November 2026', 'dbc', '3 receipts · 2 saved, 1 ignored'],
        ['2026-10', 'October 2026', 'a', '1 receipt · saved'],
      ]
    );
    assert.deepEqual(doneByMonth([]), []);
  });

  test('months with receipts, newest first; newest-first keeps the input as is', () => {
    const list = [rc('a', '2026-09-01T00:00:00Z'), rc('b', '2026-11-01T00:00:00Z'), rc('c', '2026-09-30T00:00:00Z')];
    assert.deepEqual(receiptMonths(list), ['2026-11', '2026-09']);
    assert.deepEqual(newestFirst(list).map((r) => r.id), ['b', 'c', 'a']);
    assert.deepEqual(list.map((r) => r.id), ['a', 'b', 'c']);
  });

  test('saved this month counts confirmed receipts that came in this month', () => {
    const list = [rc('a', '2026-11-02T00:00:00Z'), rc('b', '2026-11-05T00:00:00Z', 'ignored'), rc('c', '2026-10-30T00:00:00Z'), rc('d', '2026-11-06T00:00:00Z', 'needs_review')];
    assert.equal(savedInMonth(list, '2026-11'), 1);
  });
});

describe('payments without a receipt', () => {
  const payments = [
    { paidOn: '2026-11-12', serviceLinkId: 's-supa', receiptId: undefined },
    { paidOn: '2026-11-03', serviceLinkId: 's-twilio', receiptId: 'r1' },
    { paidOn: '2026-11-05', serviceLinkId: 's-twilio', receiptId: undefined },
    { paidOn: '2026-10-28', serviceLinkId: 's-vercel', receiptId: undefined },
    { paidOn: '2026-11-08', serviceLinkId: undefined, receiptId: undefined },
  ];

  test('only this month, only those with no receipt', () => {
    assert.equal(paymentsWithoutReceipt(payments, '2026-11').length, 3);
  });

  test('a line per payment under its app, saying when a receipt is already waiting', () => {
    const waiting = [{ extracted: { suggestedServiceId: 's-supa' }, serviceLinkId: undefined }];
    const map = missingReceiptsByApp(payments, services, waiting, '2026-11');
    assert.deepEqual([...map.entries()], [
      ['p-addis', ['Twilio, Nov 5: no receipt yet', 'Supabase, Nov 12: receipt waiting for review above']],
    ]);
  });
});

describe('done receipts by app', () => {
  const done = [
    rc('v1', '2026-11-07T00:00:00Z', 'confirmed', 's-vercel'),
    rc('t1', '2026-11-03T00:00:00Z', 'confirmed', 's-twilio'),
    rc('n1', '2026-11-09T00:00:00Z', 'ignored'),
    rc('v0', '2026-10-07T00:00:00Z', 'confirmed', 's-vercel'),
    rc('x1', '2026-11-10T00:00:00Z', 'confirmed', 's-gone'),
  ];

  test('one column per app in the apps order, then the unlinked ones', () => {
    const cols = doneByApp(done, services, products, '2026-11');
    assert.deepEqual(
      cols.map((c) => [c.productId, c.name, c.receipts.map((r) => r.id).join(',')]),
      [
        ['p-stack', 'StackTrack', 'v1'],
        ['p-addis', 'Addis Bites', 't1'],
        [null, 'Not linked to an app', 'x1,n1'],
      ]
    );
  });

  test('all months, and an app with only a missing receipt still gets a column', () => {
    const missing = new Map([['p-yg', ['Google, Nov 15: no receipt yet']]]);
    const cols = doneByApp(done, services, products, 'all', missing);
    assert.deepEqual(cols.map((c) => c.name), ['StackTrack', 'Addis Bites', 'YG Retails', 'Not linked to an app']);
    assert.deepEqual(cols[0].receipts.map((r) => r.id), ['v1', 'v0']);
    assert.deepEqual(cols[2].receipts, []);
    assert.deepEqual(cols[2].missing, ['Google, Nov 15: no receipt yet']);
  });

  test('a month with nothing gives no columns', () => {
    assert.deepEqual(doneByApp(done, services, products, '2026-08'), []);
  });
});
