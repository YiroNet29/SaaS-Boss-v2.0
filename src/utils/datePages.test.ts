import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { ImportantDate, PaymentSource, Product, ServiceLink } from '../types';
import {
  appStatusTone,
  columnCount,
  columnEmptyText,
  dateColumns,
  dateEntry,
  dateStats,
  dateTone,
  dayLabel,
  dayParts,
  dueText,
  filterDates,
  monthLabel,
  recurrenceText,
  renewalEntries,
  renewalInfo,
  timelineBlocks,
  typeLabel,
  type DateFilters,
} from './datePages';

const TODAY = '2026-11-23';

const date = (over: Partial<ImportantDate>): ImportantDate => ({
  id: 'd',
  workspaceId: 'w',
  type: 'custom',
  title: 'A date',
  dueDate: '2026-12-09',
  recurrence: 'none',
  status: 'open',
  source: 'manual',
  createdAt: '2026-01-01',
  ...over,
});

const svc = (over: Partial<ServiceLink>): ServiceLink => ({
  id: 's',
  workspaceId: 'w',
  productId: 'p1',
  environmentType: 'production',
  category: 'hosting',
  providerName: 'Vercel',
  accountEmail: '',
  loginUrl: '',
  plan: 'Pro',
  billingCycle: 'monthly',
  cost: 20,
  currency: 'USD',
  autoRenew: true,
  paymentMethodLabel: '',
  notes: '',
  status: 'active',
  vaultRefs: [],
  createdAt: '2026-01-01',
  ...over,
});

const product = (id: string, name: string, status: Product['status'] = 'live'): Product => ({
  id,
  workspaceId: 'w',
  name,
  description: '',
  status,
  tags: [],
  environments: [],
  createdAt: '2026-01-01',
});

const NAMES = new Map([
  ['p1', 'StackTrack'],
  ['p2', 'Addis Bites'],
]);
const ALL: DateFilters = { search: '', status: 'all', type: 'all', productId: 'all' };
const OPEN: DateFilters = { ...ALL, status: 'open' };

describe('filterDates', () => {
  const dates = [
    date({ id: 'a', title: 'saasboss.io domain', productId: 'p1', type: 'domain expiry' }),
    date({ id: 'b', title: 'Chapa contract', productId: 'p2', type: 'contract renewal', status: 'snoozed' }),
    date({ id: 'c', title: 'Yearly tax', notes: 'Ask the accountant', status: 'done' }),
  ];
  const ids = (f: Partial<DateFilters>) => filterDates(dates, NAMES, { ...ALL, ...f }).map((d) => d.id);

  test('"open" keeps active and snoozed dates, hides done ones', () => {
    assert.deepEqual(ids({ status: 'open' }), ['a', 'b']);
    assert.deepEqual(ids({ status: 'done' }), ['c']);
    assert.deepEqual(ids({}), ['a', 'b', 'c']);
  });

  test('search looks at the title, the app ("Global" when none) and the notes', () => {
    assert.deepEqual(ids({ search: 'DOMAIN' }), ['a']);
    assert.deepEqual(ids({ search: 'addis' }), ['b']);
    assert.deepEqual(ids({ search: 'global' }), ['c']);
    assert.deepEqual(ids({ search: 'accountant' }), ['c']);
  });

  test('type and app filters', () => {
    assert.deepEqual(ids({ type: 'domain expiry' }), ['a']);
    assert.deepEqual(ids({ productId: 'p2' }), ['b']);
  });
});

describe('labels', () => {
  test('types read with a capital', () => {
    assert.equal(typeLabel('domain expiry'), 'Domain expiry');
    assert.equal(typeLabel('SSL expiry'), 'SSL expiry');
  });

  test('tone: done, overdue, today or tomorrow, later', () => {
    assert.equal(dateTone('done', -4), 'ok');
    assert.equal(dateTone('open', -1), 'bad');
    assert.equal(dateTone('open', 0), 'warn');
    assert.equal(dateTone('snoozed', 1), 'warn');
    assert.equal(dateTone('open', 5), 'date');
  });

  test('due text says when it was snoozed to', () => {
    assert.equal(dueText({ dueDate: '2026-11-20' }), 'Due Nov 20, 2026');
    assert.equal(dueText({ dueDate: '2026-11-20', snoozedUntil: '2026-12-01' }), 'Due Nov 20, 2026 · snoozed to Dec 1, 2026');
  });

  test('recurrence', () => {
    assert.equal(recurrenceText({ recurrence: 'none' }), null);
    assert.equal(recurrenceText({ recurrence: 'yearly' }), 'Recurs yearly');
    assert.equal(recurrenceText({ recurrence: 'custom days', customRecurrenceDays: 45 }), 'Recurs every 45 days');
    assert.equal(recurrenceText({ recurrence: 'custom days' }), 'Recurs custom days');
  });

  test('day parts: weekday, or month and weekday (and the year when not this one)', () => {
    assert.deepEqual(dayParts('2026-12-01', false, TODAY), { num: '1', sub: 'Tue' });
    assert.deepEqual(dayParts('2026-11-20', true, TODAY), { num: '20', sub: 'Nov · Fri' });
    assert.deepEqual(dayParts('2025-11-20', true, TODAY), { num: '20', sub: 'Nov 2025 · Thu' });
  });

  test('day label gets the year only when it is not this one', () => {
    assert.equal(dayLabel('2026-12-20', TODAY), 'Dec 20');
    assert.equal(dayLabel('2027-01-03', TODAY), 'Jan 3, 2027');
  });

  test('month label', () => {
    assert.equal(monthLabel('2026-12'), 'December 2026');
  });
});

describe('timeline', () => {
  test('a snoozed date sits on the day it was snoozed to', () => {
    const e = dateEntry(date({ dueDate: '2026-11-20', snoozedUntil: '2026-12-01' }), TODAY);
    assert.equal(e.day, '2026-12-01');
    assert.equal(e.daysDiff, 8);
  });

  test('overdue first, then a block per month; done dates stay in their month', () => {
    const entries = [
      dateEntry(date({ id: 'jan', title: 'Domain', dueDate: '2027-01-03' }), TODAY),
      dateEntry(date({ id: 'late', title: 'Invoice', dueDate: '2026-11-20' }), TODAY),
      dateEntry(date({ id: 'done', title: 'Old', dueDate: '2026-11-02', status: 'done' }), TODAY),
      dateEntry(date({ id: 'dec', title: 'Trial', dueDate: '2026-12-09' }), TODAY),
      ...renewalEntries([svc({ id: 'v', renewalDate: '2026-12-09' })], NAMES, ALL, TODAY),
    ];
    const blocks = timelineBlocks(entries);
    assert.deepEqual(
      blocks.map((b) => [b.label, b.overdue, b.entries.map((e) => e.key)]),
      [
        ['Overdue', true, ['date-late']],
        ['November 2026', false, ['date-done']],
        ['December 2026', false, ['date-dec', 'renewal-v']],
        ['January 2027', false, ['date-jan']],
      ]
    );
  });

  test('renewals: like the Calendar, not cancelled and with a date; search and app filter apply', () => {
    const services = [
      svc({ id: 'a', providerName: 'Vercel', renewalDate: '2026-12-07' }),
      svc({ id: 'b', providerName: 'Twilio', productId: 'p2', renewalDate: '2026-12-03' }),
      svc({ id: 'c', providerName: 'Old', renewalDate: '2026-12-03', status: 'cancelled' }),
      svc({ id: 'd', providerName: 'Nodate' }),
    ];
    const keys = (f: Partial<DateFilters>) => renewalEntries(services, NAMES, { ...OPEN, ...f }, TODAY).map((e) => e.key);
    assert.deepEqual(keys({}), ['renewal-a', 'renewal-b']);
    assert.deepEqual(keys({ search: 'twil' }), ['renewal-b']);
    assert.deepEqual(keys({ search: 'stacktrack' }), ['renewal-a']);
    assert.deepEqual(keys({ productId: 'p2' }), ['renewal-b']);
    assert.deepEqual(keys({ status: 'done' }), []);
    assert.deepEqual(keys({ type: 'domain expiry' }), []);
    assert.equal(renewalEntries(services, NAMES, OPEN, TODAY)[0].title, 'Vercel renewal');
  });

  test('renewal info: how it is paid, the price and who pays', () => {
    const card: PaymentSource = {
      id: 'c1',
      workspaceId: 'w',
      name: 'Virtual card',
      kind: 'card',
      currency: 'USD',
      prepaid: true,
      openingBalance: 0,
      last4: '4821',
      notes: '',
      archived: false,
      createdAt: '2026-01-01',
    };
    assert.deepEqual(renewalInfo(svc({ paymentSourceId: 'c1' }), [card], 8), {
      tone: 'auto',
      label: 'Auto-renews',
      sub: '$20/mo · Virtual card ·· 4821',
      dot: 'auto',
    });
    const usage = renewalInfo(svc({ billingCycle: 'usage-based', cost: 15, paymentMethodLabel: 'Visa 4417' }), [], 3);
    assert.equal(usage.label, 'Usage-based');
    assert.equal(usage.sub, '≈ $15/mo · Visa 4417');
    const manual = renewalInfo(svc({ autoRenew: false, billingCycle: 'yearly', cost: 12 }), [], -2);
    assert.equal(manual.label, 'Renew by hand');
    assert.equal(manual.dot, 'bad');
    assert.equal(renewalInfo(svc({ billingCycle: 'free', cost: 0 }), [], 4).label, 'Free plan');
  });
});

describe('portfolio columns', () => {
  const products = [product('p1', 'StackTrack'), product('p2', 'Addis Bites'), product('p3', 'YG Retails', 'building')];
  const dates = [
    date({ id: 'feb', title: 'Rotate key', productId: 'p1', dueDate: '2027-02-14' }),
    date({ id: 'jan', title: 'Domain', productId: 'p1', dueDate: '2027-01-03' }),
    date({ id: 'old', title: 'Long gone', productId: 'p1', dueDate: '2026-10-01', status: 'done' }),
    date({ id: 'late', title: 'Invoice', productId: 'p1', dueDate: '2026-11-20' }),
    date({ id: 'tax', title: 'Tax' }),
    date({ id: 'orphan', title: 'Deleted app', productId: 'gone' }),
  ];

  test('overdue on top of its column, then by date; dates without a (known) app go to the workspace', () => {
    const cols = dateColumns(dates, products, TODAY);
    assert.deepEqual(
      cols.map((c) => [c.key, c.dates.map((d) => d.id)]),
      [
        ['p1', ['late', 'old', 'jan', 'feb']],
        ['workspace', ['orphan', 'tax']],
      ]
    );
    assert.equal(columnCount(cols[0]), '3 open · 1 done');
    assert.equal(columnCount(cols[1]), '2 open');
  });

  test('columns follow the given order; empty ones only when asked', () => {
    const cols = dateColumns(dates, products, TODAY, { order: ['p2', 'p1'], showEmpty: true });
    assert.deepEqual(cols.map((c) => c.key), ['p2', 'p1', 'p3', 'workspace']);
    assert.equal(columnCount(cols[0]), '');
  });

  test('empty column wording and app status colours', () => {
    assert.equal(columnEmptyText('open'), 'No open dates.');
    assert.equal(columnEmptyText('done'), 'No completed dates.');
    assert.equal(columnEmptyText('all'), 'No dates yet.');
    assert.equal(appStatusTone('live'), 'ok');
    assert.equal(appStatusTone('building'), 'warn');
    assert.equal(appStatusTone('retired'), 'none');
  });
});

describe('dateStats', () => {
  test('counts open dates only', () => {
    const stats = dateStats(
      [
        date({ id: 'a', dueDate: '2026-11-20' }),
        date({ id: 'b', dueDate: '2026-11-01', status: 'done' }),
        date({ id: 'c', dueDate: '2026-12-09' }),
        date({ id: 'd', dueDate: '2026-11-20', snoozedUntil: '2026-11-30', status: 'snoozed' }),
        date({ id: 'e', dueDate: '2027-01-03', type: 'domain expiry', checkTarget: 'saasboss.io', autoCheck: true }),
        date({ id: 'f', dueDate: '2027-01-03', type: 'SSL expiry', checkTarget: 'api.x.com', autoCheck: false }),
      ],
      [
        svc({ id: 'a', renewalDate: '2026-12-01' }),
        svc({ id: 'b', renewalDate: '2027-02-01' }),
        svc({ id: 'c', renewalDate: '2026-12-01', status: 'cancelled' }),
        svc({ id: 'd', renewalDate: '2026-11-20', autoRenew: false }),
        svc({ id: 'e', renewalDate: '2026-11-20', status: 'cancelled' }),
      ],
      TODAY
    );
    assert.deepEqual(stats, { overdue: 1, next30: 2, renewals30: 1, renewalsOverdue: 1, autoChecked: 1 });
  });
});
