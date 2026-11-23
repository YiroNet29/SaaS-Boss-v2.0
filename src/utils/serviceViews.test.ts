import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Product, ServiceLink } from '../types';
import {
  addDays,
  appCards,
  appStatus,
  canMarkPaid,
  countLabel,
  dateCell,
  dayLabel,
  howItRenews,
  listNames,
  monthEnd,
  monthSpan,
  otherCurrency,
  planLabel,
  providerCards,
  renewGroupKey,
  renewalGroups,
  sharedProviderCount,
  whenPill,
} from './serviceViews';

const TODAY = '2026-11-23';
const RATE = 160;

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

const app = (id: string, name: string, over: Partial<Product> = {}): Product => ({
  id,
  workspaceId: 'w',
  name,
  description: '',
  status: 'live',
  tags: [],
  environments: [],
  createdAt: '2026-01-01',
  ...over,
});

describe('dates', () => {
  test('days and month ends, across months and years', () => {
    assert.equal(addDays(TODAY, 14), '2026-12-07');
    assert.equal(addDays('2026-12-25', 10), '2027-01-04');
    assert.equal(monthEnd('2026-12-07'), '2026-12-31');
    assert.equal(monthEnd('2028-02-03'), '2028-02-29');
  });

  test('a date about a year away gets its year', () => {
    assert.equal(dayLabel('2026-12-01', 8), 'Dec 1');
    assert.equal(dayLabel('2027-11-20', 362), 'Nov 20, 2027');
  });

  test('month spans add years only when a month name could mean this year', () => {
    assert.equal(monthSpan('2027-01-03', '2027-03-02', TODAY), 'January – March');
    assert.equal(monthSpan('2027-01-03', '2027-01-20', TODAY), 'January');
    assert.equal(monthSpan('2027-01-03', '2027-11-20', TODAY), 'January – November 2027');
    assert.equal(monthSpan('2027-01-03', '2028-02-01', TODAY), 'January 2027 – February 2028');
    assert.equal(monthSpan('2027-11-03', '2027-11-20', TODAY), 'November 2027');
  });
});

describe('how a service renews', () => {
  test('pill words for each kind', () => {
    assert.equal(howItRenews(svc({})).label, 'Auto-renews');
    assert.equal(howItRenews(svc({ autoRenew: false })).label, 'Renew by hand');
    assert.equal(howItRenews(svc({ billingCycle: 'usage-based' })).label, 'Usage-based');
    assert.equal(howItRenews(svc({ billingCycle: 'usage-based', autoRenew: false })).tone, 'manual');
    assert.equal(howItRenews(svc({ billingCycle: 'free', cost: 0 })).label, 'Free plan');
    assert.equal(howItRenews(svc({ billingCycle: 'one-time' })).label, 'Paid once');
    assert.equal(howItRenews(svc({ status: 'trial' })).label, 'Free trial');
    assert.equal(howItRenews(svc({ status: 'paused' })).label, 'Paused');
    assert.equal(howItRenews(svc({ status: 'cancelled', billingCycle: 'free' })).label, 'Cancelled');
  });

  test('Mark paid only for dated renewals you pay by hand', () => {
    assert.equal(canMarkPaid(svc({ autoRenew: false, renewalDate: '2026-12-01' })), true);
    assert.equal(canMarkPaid(svc({ autoRenew: true, renewalDate: '2026-12-01' })), false);
    assert.equal(canMarkPaid(svc({ autoRenew: false })), false);
    assert.equal(canMarkPaid(svc({ autoRenew: false, renewalDate: '2026-12-01', status: 'cancelled' })), false);
    assert.equal(canMarkPaid(svc({ autoRenew: false, renewalDate: '2026-12-01', billingCycle: 'one-time' })), false);
    assert.equal(canMarkPaid(svc({ autoRenew: false, renewalDate: '2026-12-01', billingCycle: 'free' })), false);
  });

  test('Portfolio pills put the date first', () => {
    assert.deepEqual(whenPill(svc({ renewalDate: '2026-12-07' }), TODAY), { tone: 'auto', label: 'Dec 7 · auto' });
    assert.deepEqual(whenPill(svc({ renewalDate: '2027-01-03', autoRenew: false }), TODAY), { tone: 'manual', label: 'Jan 3 · by hand' });
    assert.deepEqual(whenPill(svc({ renewalDate: '2026-12-01', billingCycle: 'usage-based' }), TODAY), { tone: 'usage', label: 'Dec 1 · usage' });
    assert.deepEqual(whenPill(svc({ renewalDate: '2026-11-20' }), TODAY), { tone: 'overdue', label: 'Overdue · Nov 20' });
    assert.deepEqual(whenPill(svc({ status: 'trial', trialEndsAt: '2026-12-02', renewalDate: '2027-01-01' }), TODAY), { tone: 'manual', label: 'Trial ends Dec 2' });
    assert.deepEqual(whenPill(svc({ billingCycle: 'free', cost: 0 }), TODAY), { tone: 'free', label: 'Free plan' });
    assert.deepEqual(whenPill(svc({}), TODAY), { tone: 'none', label: 'No date · auto' });
  });

  test('Timeline date cells', () => {
    assert.deepEqual(dateCell(svc({ renewalDate: '2026-12-01' }), TODAY), { date: 'Dec 1', rel: 'in 8 days', overdue: false });
    assert.deepEqual(dateCell(svc({ renewalDate: '2026-11-20' }), TODAY), { date: 'Nov 20', rel: '3 days ago', overdue: true });
    assert.deepEqual(dateCell(svc({ billingCycle: 'free', renewalDate: '2026-12-01' }), TODAY), { date: '—', rel: 'no renewal', overdue: false });
    assert.deepEqual(dateCell(svc({}), TODAY), { date: '—', rel: 'no date set', overdue: false });
    assert.equal(dateCell(svc({ status: 'paused', renewalDate: '2026-11-20' }), TODAY).overdue, false);
  });

  test('plan and the other currency', () => {
    assert.equal(planLabel(svc({ plan: 'Pro' })), 'Pro');
    assert.equal(planLabel(svc({ plan: '', billingCycle: 'yearly' })), 'Yearly');
    assert.equal(otherCurrency(svc({ cost: 20 }), RATE), 'ETB 3,200');
    assert.equal(otherCurrency(svc({ cost: 1600, currency: 'ETB' }), RATE), '$10');
    assert.equal(otherCurrency(svc({ cost: 0, billingCycle: 'free' }), RATE), '');
  });
});

describe('Timeline groups', () => {
  const list = [
    svc({ id: 'late', providerName: 'Old', renewalDate: '2026-11-20' }),
    svc({ id: 'claude', providerName: 'Claude API', renewalDate: '2026-12-01', billingCycle: 'usage-based' }),
    svc({ id: 'vercel', providerName: 'Vercel Pro', renewalDate: '2026-12-07' }),
    svc({ id: 'supa', providerName: 'Supabase Pro', renewalDate: '2026-12-12' }),
    svc({ id: 'dom2', providerName: 'ygretails.com', renewalDate: '2027-02-08', billingCycle: 'yearly' }),
    svc({ id: 'dom1', providerName: 'saasboss.io', renewalDate: '2027-01-03', billingCycle: 'yearly' }),
    svc({ id: 'nodate', providerName: 'Resend' }),
    svc({ id: 'once', providerName: 'Logo', billingCycle: 'one-time', renewalDate: '2026-12-02' }),
    svc({ id: 'free', providerName: 'Cloudflare', billingCycle: 'free', cost: 0 }),
    svc({ id: 'gone', providerName: 'Heroku', status: 'cancelled', renewalDate: '2026-12-03' }),
  ];

  test('each service lands in the right group', () => {
    const key = (id: string) => renewGroupKey(list.find((s) => s.id === id)!, TODAY);
    assert.equal(key('late'), 'overdue');
    assert.equal(key('claude'), 'soon');
    assert.equal(key('vercel'), 'soon'); // the 14th day is still "next 2 weeks"
    assert.equal(key('supa'), 'month');
    assert.equal(key('dom1'), 'later');
    assert.equal(key('nodate'), 'none');
    assert.equal(key('once'), 'none');
    assert.equal(key('free'), 'free');
    assert.equal(key('gone'), 'stopped');
  });

  test('groups are labelled by real dates, in order, soonest first inside', () => {
    const groups = renewalGroups(list, TODAY);
    assert.deepEqual(
      groups.map((g) => g.label),
      ['Overdue', 'Next 2 weeks · Nov 23–Dec 7', 'Later in December', 'January – February', 'No renewal date', 'Free plans', 'Paused or cancelled']
    );
    assert.deepEqual(groups[1].services.map((s) => s.id), ['claude', 'vercel']);
    assert.deepEqual(groups[3].services.map((s) => s.id), ['dom1', 'dom2']);
    assert.deepEqual(groups[4].services.map((s) => s.id), ['once', 'nodate']); // by name
  });

  test('early in a month, "later this month" is that month', () => {
    const groups = renewalGroups([svc({ renewalDate: '2026-11-25' })], '2026-11-03');
    assert.deepEqual(groups.map((g) => g.label), ['Later in November']);
  });

  test('empty groups are left out', () => {
    assert.deepEqual(renewalGroups([], TODAY), []);
  });
});

describe('Portfolio cards', () => {
  const products = [app('p1', 'StackTrack'), app('p2', 'Addis Bites'), app('p3', 'YG Retails', { status: 'building' })];
  const all = [
    svc({ id: 'a', productId: 'p1', providerName: 'Vercel', cost: 20, renewalDate: '2026-12-07' }),
    svc({ id: 'b', productId: 'p1', providerName: 'Supabase', billingCycle: 'free', cost: 0 }),
    svc({ id: 'c', productId: 'p2', providerName: 'Vercel', cost: 20, renewalDate: '2026-12-01' }),
    svc({ id: 'd', productId: 'p2', providerName: 'Supabase', cost: 25, renewalDate: '2026-12-12' }),
    svc({ id: 'e', productId: 'gone', providerName: 'Twilio', cost: 8 }),
  ];

  test('one card per app, most expensive first, the filtered rows soonest first', () => {
    const cards = appCards(products, all, all, TODAY, RATE, true);
    assert.deepEqual(cards.map((c) => c.name), ['Addis Bites', 'StackTrack', 'YG Retails', 'No app']);
    assert.equal(cards[0].monthlyUsd, 45);
    assert.deepEqual(cards[0].services.map((s) => s.id), ['c', 'd']);
    assert.deepEqual(cards[1].services.map((s) => s.id), ['a', 'b']);
    assert.equal(cards[2].services.length, 0);
    assert.equal(cards[3].monthlyUsd, undefined);
  });

  test('while filtering, apps without a match are left out and counts say so', () => {
    const shown = all.filter((s) => s.providerName === 'Vercel');
    const cards = appCards(products, all, shown, TODAY, RATE, false);
    assert.deepEqual(cards.map((c) => c.name), ['Addis Bites', 'StackTrack']);
    assert.equal(countLabel(cards[0].services.length, cards[0].total), '1 of 2 services');
    assert.equal(countLabel(1, 1), '1 service');
  });

  test('one card per provider, the most shared first, with its apps and monthly total', () => {
    const cards = providerCards(products, all, all, TODAY, RATE);
    assert.deepEqual(cards.map((c) => c.name), ['Vercel', 'Supabase', 'Twilio']);
    assert.deepEqual(cards[0].apps, ['Addis Bites', 'StackTrack']);
    assert.equal(cards[0].monthlyUsd, 40);
    assert.deepEqual(cards[0].services.map((s) => s.id), ['c', 'a']);
    assert.deepEqual(cards[2].apps, ['No app']);
    assert.equal(sharedProviderCount(all, products.length, RATE), 2);
  });

  test('app status pills and lists of names', () => {
    assert.deepEqual(appStatus('live'), { tone: 'ok', label: 'Live' });
    assert.deepEqual(appStatus('building'), { tone: 'warn', label: 'Building' });
    assert.equal(listNames(['StackTrack']), 'StackTrack');
    assert.equal(listNames(['A', 'B', 'C']), 'A, B and C');
  });
});
