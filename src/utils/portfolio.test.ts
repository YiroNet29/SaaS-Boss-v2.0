import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Payment, PaymentSource, ServiceLink, SourceTransaction } from '../types';
import { appServiceLines, budgetLine, categoryLabel, priceLabel, serviceLine, sharedCosts, siteName } from './portfolio';
import { budgetUse } from './budgets';

const TODAY = '2026-11-23';

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

const source = (over: Partial<PaymentSource>): PaymentSource => ({
  id: 'c1',
  workspaceId: 'w',
  name: 'Virtual card',
  kind: 'card',
  currency: 'USD',
  prepaid: true,
  openingBalance: 0,
  notes: '',
  archived: false,
  createdAt: '2026-01-01',
  ...over,
});

describe('service lines', () => {
  test('prices read per month, per year, roughly, once or free', () => {
    assert.equal(priceLabel(svc({ cost: 20 })), '$20/mo');
    assert.equal(priceLabel(svc({ cost: 12.98, billingCycle: 'yearly' })), '$12.98/yr');
    assert.equal(priceLabel(svc({ cost: 15, billingCycle: 'usage-based' })), '≈ $15/mo');
    assert.equal(priceLabel(svc({ cost: 99, billingCycle: 'one-time' })), '$99 once');
    assert.equal(priceLabel(svc({ cost: 0, billingCycle: 'free' })), 'Free');
    assert.equal(priceLabel(svc({ cost: 1600, currency: 'ETB' })), 'ETB 1,600/mo');
  });

  test('category names read plainly', () => {
    assert.equal(categoryLabel('hosting'), 'Hosting');
    assert.equal(categoryLabel('domain registrar'), 'Domain');
    assert.equal(categoryLabel('SMS'), 'SMS');
    assert.equal(categoryLabel('Google API'), 'Google API');
  });

  test('says how it renews and when', () => {
    const auto = serviceLine(svc({ renewalDate: '2026-12-07' }), TODAY);
    assert.deepEqual([auto.kind, auto.when, auto.tone], ['Hosting · renews by itself', 'Dec 7', 'auto']);

    const hand = serviceLine(svc({ category: 'domain registrar', autoRenew: false, billingCycle: 'yearly', renewalDate: '2027-01-03' }), TODAY);
    assert.deepEqual([hand.kind, hand.when, hand.tone], ['Domain · renew by hand', 'Jan 3', 'manual']);

    const usage = serviceLine(svc({ billingCycle: 'usage-based', renewalDate: '2026-12-01' }), TODAY);
    assert.equal(usage.tone, 'usage');

    const late = serviceLine(svc({ renewalDate: '2026-11-20' }), TODAY);
    assert.deepEqual([late.when, late.tone, late.daysDiff], ['Overdue · Nov 20', 'overdue', -3]);

    const trial = serviceLine(svc({ status: 'trial', trialEndsAt: '2026-12-02', renewalDate: '2027-01-01' }), TODAY);
    assert.deepEqual([trial.kind, trial.when, trial.tone], ['Hosting · free trial', 'Trial ends Dec 2', 'manual']);

    const free = serviceLine(svc({ billingCycle: 'free', cost: 0, renewalDate: '2026-12-01' }), TODAY);
    assert.deepEqual([free.when, free.tone], ['Free plan', 'free']);

    const nextYear = serviceLine(svc({ billingCycle: 'yearly', renewalDate: '2027-11-20' }), TODAY);
    assert.equal(nextYear.when, 'Nov 20, 2027');

    const undated = serviceLine(svc({ renewalDate: undefined }), TODAY);
    assert.deepEqual([undated.when, undated.tone], ['No date', 'none']);
  });

  test("an app's services: overdue first, then soonest, then undated, then free; cancelled and other apps left out", () => {
    const lines = appServiceLines(
      [
        svc({ id: 'a', providerName: 'Free DNS', billingCycle: 'free', cost: 0 }),
        svc({ id: 'b', providerName: 'Later', renewalDate: '2026-12-20' }),
        svc({ id: 'c', providerName: 'Soon', renewalDate: '2026-11-25' }),
        svc({ id: 'd', providerName: 'No date' }),
        svc({ id: 'e', providerName: 'Late', renewalDate: '2026-11-01' }),
        svc({ id: 'f', providerName: 'Gone', status: 'cancelled', renewalDate: '2026-11-24' }),
        svc({ id: 'g', providerName: 'Other app', productId: 'p2', renewalDate: '2026-11-24' }),
      ],
      'p1',
      TODAY
    );
    assert.deepEqual(
      lines.map((l) => l.name),
      ['Late', 'Soon', 'Later', 'No date', 'Free DNS']
    );
  });
});

describe('budget line', () => {
  test('no budget', () => {
    assert.deepEqual(budgetLine(null), { text: 'No budget set', width: 0, tone: 'none' });
  });
  test('under, near and over the budget', () => {
    assert.deepEqual(budgetLine(budgetUse(50, 20)), { text: '$20 paid of the $50 budget this month (40%)', width: 40, tone: 'ok' });
    assert.equal(budgetLine(budgetUse(40, 34.4)).tone, 'warn');
    const over = budgetLine(budgetUse(40, 52));
    assert.deepEqual([over.text, over.width, over.tone], ['Over budget: $52 paid of $40 this month', 100, 'bad']);
  });
});

describe('shared costs', () => {
  const pay = (over: Partial<Payment>): Payment =>
    ({ id: 'p', workspaceId: 'w', paidOn: '2026-11-01', amount: 0, currency: 'USD', ...over }) as Payment;
  const tx = (over: Partial<SourceTransaction>): SourceTransaction =>
    ({ id: 't', workspaceId: 'w', kind: 'top_up', amount: 0, happenedOn: '2026-11-01', ...over }) as SourceTransaction;

  test('a prepaid card short for the next 30 days says how much to top up and by when', () => {
    const card = source({ id: 'c1', last4: '4821', openingBalance: 62.4 });
    const out = sharedCosts({
      sources: [card],
      payments: [],
      transactions: [],
      services: [
        svc({ id: 'a', paymentSourceId: 'c1', cost: 50, renewalDate: '2026-12-07' }),
        svc({ id: 'b', paymentSourceId: 'c1', cost: 25, renewalDate: '2026-12-12' }),
      ],
      today: TODAY,
      etbPerUsd: 160,
    });
    assert.deepEqual(
      out.map((c) => [c.title, c.sub, c.status, c.tone]),
      [['Virtual card ·· 4821', 'pays 2 services · $62.40 left', 'Top up $13 by Dec 12', 'warn']]
    );
  });

  test('a card below zero says how much it is short', () => {
    const [c] = sharedCosts({
      sources: [source({ id: 'c1', openingBalance: 10 })],
      payments: [pay({ id: 'p1', sourceId: 'c1', amount: 25 })],
      transactions: [],
      services: [svc({ id: 'a', paymentSourceId: 'c1' })],
      today: TODAY,
      etbPerUsd: 160,
    });
    assert.equal(c.sub, 'pays 1 service · $15 short');
  });

  test('a person who paid for you shows what you owe, first in the list', () => {
    const friend = source({ id: 'f1', name: 'Friend in the USA', kind: 'person', prepaid: false });
    const card = source({ id: 'c1', openingBalance: 500 });
    const out = sharedCosts({
      sources: [card, friend],
      payments: [pay({ id: 'p1', sourceId: 'f1', amount: 60 })],
      transactions: [tx({ id: 't1', sourceId: 'f1', kind: 'repayment', amount: 15 })],
      services: [svc({ id: 'a', paymentSourceId: 'c1', renewalDate: '2026-12-07' }), svc({ id: 'b', paymentSourceId: 'f1' })],
      today: TODAY,
      etbPerUsd: 160,
    });
    assert.deepEqual(
      out.map((c) => [c.title, c.status, c.tone]),
      [
        ['Friend in the USA', 'You owe $45', 'bad'],
        ['Virtual card', 'Nothing to do', 'none'],
      ]
    );
  });

  test('a card expiring soon says so; archived and unused sources are left out', () => {
    const out = sharedCosts({
      sources: [
        source({ id: 'c1', prepaid: false, expiresOn: '2026-12-31' }),
        source({ id: 'c2', name: 'Old card', archived: true }),
        source({ id: 'c3', name: 'Unused card' }),
      ],
      payments: [],
      transactions: [],
      services: [svc({ id: 'a', paymentSourceId: 'c1' }), svc({ id: 'b', paymentSourceId: 'c2' })],
      today: TODAY,
      etbPerUsd: 160,
    });
    assert.deepEqual(
      out.map((c) => [c.title, c.sub, c.status, c.tone]),
      [['Virtual card', 'pays 1 service', 'Expires in 38 days', 'warn']]
    );
  });
});

test('site names drop the scheme, www and path', () => {
  assert.equal(siteName('https://www.addisbites.com/menu'), 'addisbites.com');
  assert.equal(siteName('saas-boss-v20.vercel.app'), 'saas-boss-v20.vercel.app');
  assert.equal(siteName(undefined), '');
  assert.equal(siteName('not a url ::'), '');
});
