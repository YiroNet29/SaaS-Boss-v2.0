import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { ImportantDate, Payment, Product, ServiceLink } from '../types';
import type { DueRow } from './timeline';
import {
  appAgenda,
  appPayments,
  appTotals,
  canMarkPaid,
  chargeText,
  dateDetail,
  dateFacts,
  dateTypeLabel,
  dayLabel,
  groupByCategory,
  matchesApp,
  matchesTag,
  nextCharge,
  openDatesSummary,
  overdueText,
  paidWithName,
  paidWithNames,
  planText,
  recurrenceText,
  servicePill,
  serviceStatusTone,
  servicesSummary,
  sharedProviderNote,
  sortByNextDue,
  statusCounts,
  statusTone,
  tagOptions,
} from './appPages';

const TODAY = '2026-11-23';
const RATE = 160;

const app = (over: Partial<Product>): Product => ({
  id: 'p1',
  workspaceId: 'w',
  name: 'StackTrack',
  description: 'Tracks what my apps pay for',
  status: 'live',
  tags: ['saas'],
  environments: [],
  createdAt: '2026-10-02',
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

const date = (over: Partial<ImportantDate>): ImportantDate => ({
  id: 'd',
  workspaceId: 'w',
  productId: 'p1',
  type: 'domain expiry',
  title: 'saasboss.io domain',
  dueDate: '2027-01-03',
  recurrence: 'yearly',
  status: 'open',
  source: 'manual',
  createdAt: '2026-01-01',
  ...over,
});

const row = (over: Partial<DueRow>): DueRow => ({
  id: 'r',
  kind: 'renewal',
  name: 'Vercel',
  appName: 'StackTrack',
  productId: 'p1',
  dueDate: '2026-12-07',
  daysDiff: 14,
  usd: 20,
  etb: 3200,
  tone: 'auto',
  label: 'Auto-renews',
  ...over,
});

describe('apps list', () => {
  test('search looks at the name, description and tags; the status filter narrows', () => {
    const p = app({});
    assert.equal(matchesApp(p, 'stack', 'all'), true);
    assert.equal(matchesApp(p, 'PAY FOR', 'all'), true);
    assert.equal(matchesApp(p, 'saas', 'all'), true);
    assert.equal(matchesApp(p, 'nothing', 'all'), false);
    assert.equal(matchesApp(p, '', 'live'), true);
    assert.equal(matchesApp(p, '', 'idea'), false);
  });

  test('the tag filter: every app, one tag (any case) or the apps without a tag', () => {
    const yg = app({ tags: ['YG'] });
    const blank = app({ tags: ['  '] });
    const none = app({ tags: [] });
    assert.equal(matchesTag(yg, 'all'), true);
    assert.equal(matchesTag(yg, '#yg'), true);
    assert.equal(matchesTag(yg, '#saas'), false);
    assert.equal(matchesTag(yg, 'none'), false);
    assert.equal(matchesTag(none, 'none'), true);
    assert.equal(matchesTag(blank, 'none'), true, 'a blank tag is no tag');
    assert.equal(matchesTag(app({ tags: undefined as unknown as string[] }), 'none'), true);
  });

  test('tag choices: most-used first, written as first seen, then the apps without a tag', () => {
    const opts = tagOptions([
      app({ tags: ['YG'] }),
      app({ tags: ['yg', 'web'] }),
      app({ tags: ['web', 'YG '] }),
      app({ tags: ['Apps'] }),
      app({ tags: [] }),
    ]);
    assert.deepEqual(
      opts.map((o) => [o.value, o.label]),
      [
        ['all', 'All tags (5)'],
        ['#yg', '#YG (3)'],
        ['#web', '#web (2)'],
        ['#apps', '#Apps (1)'],
        ['none', 'No tag (1)'],
      ]
    );
    // Each choice finds exactly the apps it counts.
    const apps = [app({ tags: ['YG'] }), app({ tags: ['yg', 'YG'] }), app({ tags: [] })];
    for (const o of tagOptions(apps)) assert.equal(apps.filter((p) => matchesTag(p, o.value)).length, o.count, o.label);
  });

  test('no tag in use: no tag filter to show', () => {
    assert.deepEqual(tagOptions([app({ tags: [] }), app({ tags: [' '] })]), []);
    assert.deepEqual(tagOptions([]), []);
  });

  test('counts apps by status', () => {
    const c = statusCounts([app({}), app({ status: 'live' }), app({ status: 'building' })]);
    assert.equal(c.all, 3);
    assert.equal(c.live, 2);
    assert.equal(c.building, 1);
    assert.equal(c.idea, 0);
  });

  test('status colours', () => {
    assert.equal(statusTone('live'), 'ok');
    assert.equal(statusTone('building'), 'warn');
    assert.equal(statusTone('idea'), 'date');
    assert.equal(statusTone('paused'), 'none');
    assert.equal(statusTone('retired'), 'bad');
  });

  test('monthly cost: yearly counts as a twelfth, birr converted, usage at its price, cancelled left out', () => {
    const t = appTotals(
      'p1',
      [
        svc({ id: 'a', cost: 20 }),
        svc({ id: 'b', cost: 120, billingCycle: 'yearly' }),
        svc({ id: 'c', cost: 1600, currency: 'ETB' }),
        svc({ id: 'd', cost: 50, status: 'cancelled' }),
        svc({ id: 'e', cost: 15, billingCycle: 'usage-based' }),
        svc({ id: 'f', productId: 'p2', cost: 99 }),
      ],
      [date({ id: 'x' }), date({ id: 'y', status: 'done' }), date({ id: 'z', productId: 'p2' })],
      RATE
    );
    assert.equal(t.monthlyUsd, 20 + 10 + 10 + 15);
    assert.equal(t.monthlyEtb, 55 * RATE);
    assert.deepEqual(t.services.map((s) => s.id), ['a', 'b', 'c', 'e']);
    assert.deepEqual(t.openDates.map((d) => d.id), ['x']);
  });

  test('apps sort by the soonest thing due, overdue first, nothing due last', () => {
    const apps = [
      { id: 'a', name: 'Calm' },
      { id: 'b', name: 'Busy' },
      { id: 'c', name: 'Late' },
      { id: 'd', name: 'Another calm' },
    ];
    const sorted = sortByNextDue(apps, [
      { productId: 'b', daysDiff: 30 },
      { productId: 'b', daysDiff: 8 },
      { productId: 'c', daysDiff: -2 },
      { daysDiff: 1 },
    ]);
    assert.deepEqual(sorted.map((a) => a.name), ['Late', 'Busy', 'Another calm', 'Calm']);
  });

  test('next charge is the first renewal, overdue ones first; dates are not charges', () => {
    const rows = [
      row({ id: 'd1', kind: 'date', name: 'SSL', daysDiff: 2, tone: 'date', usd: undefined }),
      row({ id: 'a', name: 'Vercel', daysDiff: 14 }),
      row({ id: 'b', name: 'Claude API', daysDiff: 8, dueDate: '2026-12-01', tone: 'usage', usd: 15 }),
    ];
    const next = nextCharge(rows)!;
    assert.equal(next.name, 'Claude API');
    assert.equal(chargeText(next), 'Claude API · Dec 1 · ≈ $15');
    assert.equal(chargeText(rows[1]), 'Vercel · Dec 7 · $20');
    assert.equal(nextCharge([row({ name: 'Late', daysDiff: -3 }), row({ name: 'Soon', daysDiff: 1 })])!.name, 'Late');
    assert.equal(nextCharge([rows[0]]), undefined);
  });

  test('overdue note', () => {
    assert.equal(overdueText([{ name: 'Hetzner invoice', daysDiff: -2 }, { name: 'Ok', daysDiff: 3 }]), '1 overdue: Hetzner invoice');
    assert.equal(overdueText([{ name: 'A', daysDiff: -2 }, { name: 'B', daysDiff: -1 }]), '2 overdue');
    assert.equal(overdueText([{ name: 'Ok', daysDiff: 0 }]), '');
  });
});

describe('services on an app page', () => {
  test('Mark paid only for a dated renewal you pay by hand', () => {
    assert.equal(canMarkPaid(svc({ autoRenew: false, renewalDate: '2027-01-03', billingCycle: 'yearly' })), true);
    assert.equal(canMarkPaid(svc({ autoRenew: true, renewalDate: '2027-01-03' })), false);
    assert.equal(canMarkPaid(svc({ autoRenew: false })), false);
    assert.equal(canMarkPaid(svc({ autoRenew: false, renewalDate: '2027-01-03', status: 'cancelled' })), false);
    assert.equal(canMarkPaid(svc({ autoRenew: false, renewalDate: '2027-01-03', billingCycle: 'one-time' })), false);
    assert.equal(canMarkPaid(svc({ autoRenew: false, renewalDate: '2027-01-03', billingCycle: 'free' })), false);
  });

  test('paid with: the card or person first, else the typed label, each once', () => {
    const sources = [{ id: 'c1', name: 'Virtual card ·· 4821' }];
    assert.equal(paidWithName(svc({ paymentSourceId: 'c1', paymentMethodLabel: 'Visa' }), sources), 'Virtual card ·· 4821');
    assert.equal(paidWithName(svc({ paymentSourceId: 'gone', paymentMethodLabel: 'Visa' }), sources), 'Visa');
    assert.deepEqual(
      paidWithNames([svc({ paymentSourceId: 'c1' }), svc({ paymentSourceId: 'c1' }), svc({ paymentMethodLabel: 'CBE Birr' }), svc({})], sources),
      ['Virtual card ·· 4821', 'CBE Birr']
    );
  });

  test('grouped by category in the order they first appear', () => {
    const groups = groupByCategory([
      svc({ id: 'a', category: 'hosting' }),
      svc({ id: 'b', category: 'domain registrar' }),
      svc({ id: 'c', category: 'hosting' }),
    ]);
    assert.deepEqual(groups.map(([c, list]) => [c, list.map((s) => s.id)]), [
      ['hosting', ['a', 'c']],
      ['domain registrar', ['b']],
    ]);
    assert.equal(servicesSummary([svc({ category: 'hosting' }), svc({ category: 'domain registrar' })]), '2 · Hosting, Domain');
    assert.equal(servicesSummary([]), 'None yet');
  });

  test('plan line and pill', () => {
    assert.equal(planText(svc({ renewalDate: '2026-12-07' }), TODAY), 'Pro · renews by itself · production');
    assert.equal(planText(svc({ plan: '', billingCycle: 'free', environmentType: 'dev' }), TODAY), 'free plan · dev');
    assert.deepEqual(servicePill(svc({ renewalDate: '2026-12-07' }), TODAY), { tone: 'auto', label: 'Auto-renews' });
    assert.deepEqual(servicePill(svc({ renewalDate: '2026-12-07', autoRenew: false }), TODAY), { tone: 'manual', label: 'Renew by hand' });
    assert.deepEqual(servicePill(svc({ renewalDate: '2026-12-01', billingCycle: 'usage-based' }), TODAY), { tone: 'usage', label: 'Usage-based' });
    assert.deepEqual(servicePill(svc({ renewalDate: '2026-11-20' }), TODAY), { tone: 'overdue', label: 'Overdue' });
    assert.deepEqual(servicePill(svc({ status: 'trial', trialEndsAt: '2026-12-09' }), TODAY), { tone: 'manual', label: 'Trial ends' });
    assert.deepEqual(servicePill(svc({ billingCycle: 'free' }), TODAY), { tone: 'free', label: 'Free plan' });
    assert.deepEqual(servicePill(svc({}), TODAY), { tone: 'none', label: 'No date' });
  });

  test('service status colours', () => {
    assert.equal(serviceStatusTone('trial'), 'warn');
    assert.equal(serviceStatusTone('paused'), 'none');
    assert.equal(serviceStatusTone('cancelled'), 'bad');
    assert.equal(serviceStatusTone('active'), 'ok');
  });

  test('notes when another app pays the same provider', () => {
    const products = [app({ id: 'p1' }), app({ id: 'p2', name: 'Addis Bites' }), app({ id: 'p3', name: 'YG Retails' })];
    const mine = svc({ id: 'a', providerName: 'Vercel' });
    const all = [
      mine,
      svc({ id: 'b', productId: 'p2', providerName: 'Vercel ', plan: 'Hobby' }),
      svc({ id: 'x', productId: 'p3', providerName: 'vercel' }), // different spelling: a different provider, as on the Services page
      svc({ id: 'c', productId: 'p3', providerName: 'Vercel', status: 'cancelled' }),
      svc({ id: 'd', productId: 'p1', providerName: 'Vercel' }),
    ];
    assert.equal(sharedProviderNote(mine, all, products), 'Also used by Addis Bites (Hobby)');
    assert.equal(sharedProviderNote(svc({ id: 'z', providerName: 'Supabase' }), all, products), '');
  });
});

describe('dates on an app page', () => {
  test('date words: type, facts, and the year only when far away', () => {
    assert.equal(dateTypeLabel('domain expiry'), 'Domain expiry');
    assert.equal(dateTypeLabel('SSL expiry'), 'SSL expiry');
    assert.equal(dateFacts(date({ recurrence: 'quarterly' })), 'recurs quarterly');
    assert.equal(dayLabel('2026-12-01', 8), 'Dec 1');
    assert.equal(dayLabel('2027-11-20', 362), 'Nov 20, 2027');
  });

  test('recurrence and detail words', () => {
    assert.equal(recurrenceText({ recurrence: 'none' }), 'once');
    assert.equal(recurrenceText({ recurrence: 'yearly' }), 'recurs yearly');
    assert.equal(recurrenceText({ recurrence: 'custom days', customRecurrenceDays: 45 }), 'every 45 days');
    assert.equal(dateDetail(date({ autoCheck: true, checkTarget: 'saasboss.io' }), TODAY), 'In 41 days · recurs yearly · checked automatically');
    assert.equal(dateDetail(date({ dueDate: '2026-11-20', recurrence: 'none' }), TODAY), '3 days overdue · once');
    assert.equal(
      dateDetail(date({ status: 'snoozed', dueDate: '2026-11-20', snoozedUntil: '2026-11-27' }), TODAY),
      'In 4 days · recurs yearly · snoozed, was due Nov 20'
    );
  });

  test('open dates: count, overdue and the next one', () => {
    const s = openDatesSummary(
      [
        date({ id: 'a', title: 'Late', dueDate: '2026-11-20' }),
        date({ id: 'b', title: 'Resend trial', dueDate: '2026-12-09' }),
        date({ id: 'c', title: 'Later', dueDate: '2027-02-14' }),
        date({ id: 'd', title: 'Done', status: 'done', dueDate: '2026-11-25' }),
      ],
      TODAY
    );
    assert.deepEqual(s, { count: 3, overdue: 1, next: { title: 'Resend trial', date: '2026-12-09' } });
    assert.deepEqual(openDatesSummary([], TODAY), { count: 0, overdue: 0, next: undefined });
  });

  test('agenda: services and dates by day; free, undated, cancelled and done kept apart', () => {
    const a = appAgenda(
      [
        svc({ id: 'vercel', providerName: 'Vercel Pro', renewalDate: '2026-12-07' }),
        svc({ id: 'claude', providerName: 'Claude API', renewalDate: '2026-12-01', billingCycle: 'usage-based' }),
        svc({ id: 'domain', providerName: 'saasboss.io', renewalDate: '2027-01-03', autoRenew: false }),
        svc({ id: 'supabase', providerName: 'Supabase', billingCycle: 'free', renewalDate: '2026-12-02' }),
        svc({ id: 'nodate', providerName: 'Sentry' }),
        svc({ id: 'gone', providerName: 'Old host', status: 'cancelled', renewalDate: '2026-12-03' }),
        svc({ id: 'trial', providerName: 'Resend', status: 'trial', trialEndsAt: '2026-12-09', renewalDate: '2027-12-09' }),
      ],
      [
        date({ id: 'expiry', title: 'saasboss.io domain expiry', dueDate: '2027-01-03' }),
        date({ id: 'rotate', title: 'Rotate key', dueDate: '2026-11-10', snoozedUntil: '2027-02-14', status: 'snoozed' }),
        date({ id: 'old', title: 'Old', status: 'done', dueDate: '2026-10-01', completedAt: '2026-10-01' }),
      ],
      TODAY
    );
    assert.deepEqual(a.dated.map((i) => i.id), ['claude', 'vercel', 'trial', 'domain', 'expiry', 'rotate']);
    assert.equal(a.dated[0].daysDiff, 8);
    assert.equal(a.dated[5].date, '2027-02-14');
    assert.deepEqual(a.undated.map((s) => s.id), ['nodate', 'supabase']);
    assert.deepEqual(a.cancelled.map((s) => s.id), ['gone']);
    assert.deepEqual(a.done.map((d) => d.id), ['old']);
  });

  test('payments for this app, newest first', () => {
    const pay = (id: string, serviceLinkId: string, paidOn: string): Payment => ({
      id,
      workspaceId: 'w',
      serviceLinkId,
      paidOn,
      amount: 20,
      currency: 'USD',
      origin: 'manual',
      note: '',
      createdAt: paidOn,
    });
    const list = appPayments(
      [pay('1', 'a', '2026-10-07'), pay('2', 'b', '2026-11-01'), pay('3', 'x', '2026-11-20'), pay('4', 'a', '2026-11-07')],
      new Set(['a', 'b']),
      2
    );
    assert.deepEqual(list.map((p) => p.id), ['4', '2']);
  });
});
