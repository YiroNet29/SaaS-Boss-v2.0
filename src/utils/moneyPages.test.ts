import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Payment, PaymentSource, Product, ServiceLink } from '../types';
import { planTopUp, upcomingCharges } from './ledger';
import { summarizeMonth } from './monthlySummary';
import {
  andList,
  cellServices,
  chargeLedger,
  dayLabel,
  groupByMonth,
  monthChange,
  monthLine,
  moneyTotals,
  NOT_SET,
  paymentsByApp,
  payerMatrix,
  peopleLine,
  recentPaid,
  rowsLine,
  runningLabel,
  sourceMeta,
  type LedgerCharge,
} from './moneyPages';

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

const pay = (over: Partial<Payment>): Payment => ({
  id: 'pay',
  workspaceId: 'w',
  paidOn: '2026-11-07',
  amount: 20,
  currency: 'USD',
  origin: 'manual',
  note: '',
  createdAt: '2026-11-07',
  ...over,
});

const product = (id: string, name: string) => ({ id, name }) as Product;

describe('words', () => {
  test('lists read naturally', () => {
    assert.equal(andList([]), '');
    assert.equal(andList(['A']), 'A');
    assert.equal(andList(['A', 'B']), 'A and B');
    assert.equal(andList(['A', 'B', 'C']), 'A, B and C');
    assert.equal(peopleLine(['Abebe', 'Sara']), 'Abebe and Sara');
    assert.equal(peopleLine(['A', 'B', 'C']), '3 people');
  });

  test('dates get their year only when it is not this year', () => {
    assert.equal(dayLabel('2026-11-10', TODAY), 'Nov 10');
    assert.equal(dayLabel('2025-12-31', TODAY), 'Dec 31, 2025');
  });

  test('a source says its card digits, kind, currency, expiry and how many services use it', () => {
    assert.equal(sourceMeta(source({ last4: '4821', expiresOn: '2027-08-31' }), 5), '•••• 4821 · USD · prepaid · expires 08/2027 · 5 services');
    assert.equal(sourceMeta(source({ kind: 'person', prepaid: false }), 1), 'person · USD · 1 service');
    assert.equal(sourceMeta(source({ kind: 'bank', prepaid: false, currency: 'ETB' }), 0), 'bank · ETB · 0 services');
  });

  test('the running number is what is left on a prepaid card, or what you will owe a person', () => {
    assert.equal(runningLabel(source({})), 'left after');
    assert.equal(runningLabel(source({ kind: 'person', prepaid: false })), "you'll owe");
    assert.equal(runningLabel(source({ kind: 'bank', prepaid: false })), null);
  });
});

describe('the next 30 days, charge by charge', () => {
  const card = source({ lowBalance: 0 });
  const services = [
    svc({ id: 'a', providerName: 'Claude API', cost: 15, renewalDate: '2026-12-01', paymentSourceId: 'c1' }),
    svc({ id: 'b', providerName: 'Vercel Pro', cost: 20, renewalDate: '2026-12-07', paymentSourceId: 'c1' }),
    svc({ id: 'c', providerName: 'Supabase Pro', cost: 25, renewalDate: '2026-12-12', paymentSourceId: 'c1' }),
  ];

  test('each charge shows what is left after it, and the top-up goes right before the charge that would fail', () => {
    const charges = upcomingCharges(card, services, TODAY, RATE);
    const plan = planTopUp(50, charges, 0);
    const lines = chargeLedger(card, 50, charges, plan);
    assert.deepEqual(
      lines.map((l) => (l.kind === 'topup' ? `top up ${l.needed} by ${l.by}` : `${l.charge.name} ${l.after}${l.tone ? ` ${l.tone}` : ''}`)),
      ['Claude API 35', 'Vercel Pro 15', 'top up 10 by 2026-12-12', 'Supabase Pro -10 bad']
    );
  });

  test('below the low-balance mark but above zero is a warning', () => {
    const low = source({ lowBalance: 20 });
    const charges = upcomingCharges(low, services.slice(0, 2), TODAY, RATE);
    const lines = chargeLedger(low, 50, charges, planTopUp(50, charges, 20));
    assert.deepEqual(
      lines.map((l) => l.kind),
      ['charge', 'topup', 'charge']
    );
    assert.equal((lines[2] as LedgerCharge).tone, 'warn');
  });

  test('no top-up row when the money lasts', () => {
    const charges = upcomingCharges(card, services, TODAY, RATE);
    const lines = chargeLedger(card, 100, charges, planTopUp(100, charges, 0));
    assert.equal(lines.filter((l) => l.kind === 'topup').length, 0);
    assert.equal((lines[2] as LedgerCharge).after, 40);
  });

  test('a person: what you will owe grows with each charge; other cards keep no balance', () => {
    const friend = source({ id: 'f', kind: 'person', prepaid: false });
    const charges = upcomingCharges(
      friend,
      services.map((s) => ({ ...s, paymentSourceId: 'f' })),
      TODAY,
      RATE
    );
    const lines = chargeLedger(friend, 45, charges, { needed: 0, balanceAfter: 0 }) as LedgerCharge[];
    assert.deepEqual(
      lines.map((l) => l.after),
      [60, 80, 105]
    );

    const bank = source({ id: 'b', kind: 'bank', prepaid: false });
    const bankLines = chargeLedger(bank, 0, charges, { needed: 0, balanceAfter: 0 }) as LedgerCharge[];
    assert.deepEqual(
      bankLines.map((l) => l.after),
      [null, null, null]
    );
  });

  test('head numbers: charges in USD across cards, and what you owe people', () => {
    const usdCard = { source: card, balance: 50, charges: upcomingCharges(card, services, TODAY, RATE) };
    const birr = source({ id: 'e', currency: 'ETB', prepaid: false, kind: 'bank' });
    const birrView = {
      source: birr,
      balance: 0,
      charges: upcomingCharges(birr, [svc({ id: 'd', cost: 1600, currency: 'ETB', renewalDate: '2026-11-30', paymentSourceId: 'e' })], TODAY, RATE),
    };
    const friend = { source: source({ id: 'f', name: 'Friend', kind: 'person', prepaid: false }), balance: 45, charges: [] };
    const t = moneyTotals([usdCard, birrView, friend], RATE);
    assert.equal(t.next30Usd, 70);
    assert.equal(t.next30Count, 4);
    assert.equal(t.owedUsd, 45);
    assert.deepEqual(t.owedTo, ['Friend']);
    assert.equal(t.hasPeople, true);
    assert.equal(moneyTotals([usdCard], RATE).hasPeople, false);
  });

  test('what a person paid lately, oldest first', () => {
    const services = [svc({ id: 'v', providerName: 'Vercel Pro' }), svc({ id: 's', providerName: 'Supabase Pro' })];
    const payments = [
      pay({ id: '1', sourceId: 'f', serviceLinkId: 's', paidOn: '2026-10-12' }),
      pay({ id: '2', sourceId: 'f', serviceLinkId: 'v', paidOn: '2026-10-07' }),
      pay({ id: '3', sourceId: 'f', serviceLinkId: 'v', paidOn: '2026-09-07' }),
      pay({ id: '4', sourceId: 'c1', serviceLinkId: 'v', paidOn: '2026-11-07' }),
    ];
    assert.equal(recentPaid(payments, services, 'f'), 'Paid Vercel Pro (Oct 7) and Supabase Pro (Oct 12)');
    assert.equal(recentPaid(payments, services, 'nobody'), '');
    assert.equal(recentPaid([pay({ sourceId: 'f', note: 'Figma · manual' })], [], 'f'), 'Paid Figma (Nov 7)');
  });
});

describe('payments by month and by app', () => {
  const payments = [
    pay({ id: '1', paidOn: '2026-10-30', amount: 10 }),
    pay({ id: '2', paidOn: '2026-11-15', amount: 7.2 }),
    pay({ id: '3', paidOn: '2026-11-01', amount: 14.2 }),
    pay({ id: '4', paidOn: '2026-09-02', amount: 5 }),
  ];

  test('months newest first, payments newest first inside each', () => {
    const groups = groupByMonth(payments);
    assert.deepEqual(
      groups.map((g) => `${g.month}: ${g.payments.map((p) => p.id).join(',')}`),
      ['2026-11: 2,3', '2026-10: 1', '2026-09: 4']
    );
    assert.deepEqual(groupByMonth([]), []);
  });

  test('change against the month before, in dollars', () => {
    assert.equal(monthChange(74.05, 71.4, '2026-10'), '+$2.65 vs October');
    assert.equal(monthChange(70, 71.4, '2026-10'), '−$1.40 vs October');
    assert.equal(monthChange(10, 10, '2026-10'), 'Same as October');
    assert.equal(monthChange(10, 0, '2026-10'), null);
  });

  test('a month in one line, with ≈ when the birr is partly estimated', () => {
    const s = summarizeMonth({ payments, services: [], products: [], sources: [], etbPerUsd: RATE }, '2026-11');
    assert.equal(monthLine(s), `≈ ETB 3,424 · 2 payments · +$11.40 vs October`);
    // A month still in progress isn't compared with a full one.
    assert.equal(monthLine(s, { inProgress: true }), `≈ ETB 3,424 · 2 payments`);
    const exact = { ...s, etbEstimated: false, count: 1, previousUsd: 0 };
    assert.equal(monthLine(exact), 'ETB 3,424 · 1 payment');
    assert.equal(
      rowsLine([
        { name: 'Card', usd: 70.85 },
        { name: 'Friend', usd: 3.2 },
      ]),
      'Card $70.85 · Friend $3.20'
    );
  });

  test('a month grouped by app, the costliest app first; payments without a service get their own group', () => {
    const services = [
      svc({ id: 'v', productId: 'st', providerName: 'Vercel Pro' }),
      svc({ id: 'c', productId: 'st', providerName: 'Claude API' }),
      svc({ id: 's', productId: 'ab', providerName: 'Supabase Pro' }),
      svc({ id: 'x', productId: 'gone', providerName: 'Old' }),
    ];
    const products = [product('st', 'StackTrack'), product('ab', 'Addis Bites')];
    const nov = [
      pay({ id: '1', serviceLinkId: 'v', paidOn: '2026-11-07', amount: 20 }),
      pay({ id: '2', serviceLinkId: 'c', paidOn: '2026-11-01', amount: 14.2 }),
      pay({ id: '3', serviceLinkId: 's', paidOn: '2026-11-12', amount: 25 }),
      pay({ id: '4', paidOn: '2026-11-20', amount: 1600, currency: 'ETB' }),
      pay({ id: '5', serviceLinkId: 'x', paidOn: '2026-11-21', amount: 1 }),
      pay({ id: '6', serviceLinkId: 'v', paidOn: '2026-10-07', amount: 20 }),
    ];
    const groups = paymentsByApp(nov, services, products, '2026-11', RATE);
    assert.deepEqual(
      groups.map((g) => `${g.name} ${g.usd} [${g.payments.map((p) => p.id).join(',')}]`),
      ['StackTrack 34.2 [1,2]', 'Addis Bites 25 [3]', 'Not linked to a service 10 [4]', 'No product 1 [5]']
    );
  });
});

describe('each app, by who pays', () => {
  const products = [product('st', 'StackTrack'), product('ab', 'Addis Bites'), product('yg', 'YG Retails')];
  const sources = [
    source({ id: 'card', name: 'Virtual card' }),
    source({ id: 'friend', name: 'Friend', kind: 'person', prepaid: false }),
    source({ id: 'cbe', name: 'CBE Birr account', kind: 'bank', prepaid: false, currency: 'ETB' }),
    source({ id: 'old', name: 'Old card', archived: true }),
  ];
  const services = [
    svc({ id: '1', productId: 'st', providerName: 'Vercel Pro', cost: 20, paymentSourceId: 'card' }),
    svc({ id: '2', productId: 'st', providerName: 'Claude API', cost: 15, billingCycle: 'usage-based', paymentSourceId: 'card' }),
    svc({ id: '3', productId: 'st', providerName: 'saasboss.io', cost: 12, billingCycle: 'yearly', paymentSourceId: 'cbe' }),
    svc({ id: '4', productId: 'ab', providerName: 'Supabase Pro', cost: 25, paymentSourceId: 'old' }),
    svc({ id: '5', productId: 'ab', providerName: 'Twilio', cost: 8 }),
    svc({ id: '6', productId: 'yg', providerName: 'Workspace', cost: 7.2, paymentSourceId: 'card', status: 'cancelled' }),
    svc({ id: '7', productId: 'yg', providerName: 'Free tier', billingCycle: 'free', cost: 0, paymentSourceId: 'card' }),
    svc({ id: '8', productId: 'yg', providerName: 'Logo', billingCycle: 'one-time', cost: 99, paymentSourceId: 'card' }),
  ];

  test('apps as rows, cards and people as columns, with row and column totals', () => {
    const m = payerMatrix(products, services, sources, RATE);
    assert.deepEqual(
      m.columns.map((c) => c.name),
      ['Virtual card', 'Friend', 'CBE Birr account', 'Not set']
    );
    assert.equal(m.columns[3].key, NOT_SET);
    assert.deepEqual(
      m.rows.map((r) => `${r.product.name} ${r.usd} [${r.cells.map((c) => c.usd).join(' ')}]`),
      ['StackTrack 36 [35 0 1 0]', 'Addis Bites 33 [0 0 0 33]', 'YG Retails 0 [0 0 0 0]']
    );
    assert.deepEqual(m.columnUsd, [35, 0, 1, 33]);
    assert.equal(m.usd, 69);
    assert.equal(cellServices(m.rows[0].cells[0].services), 'Claude API (≈ $15/mo), Vercel Pro');
    assert.equal(cellServices(m.rows[0].cells[2].services), 'saasboss.io ($12/yr)');
  });

  test('no "Not set" column when every paid service has a card or person', () => {
    const m = payerMatrix(
      products,
      services.filter((s) => s.id === '1'),
      sources,
      RATE
    );
    assert.deepEqual(
      m.columns.map((c) => c.name),
      ['Virtual card', 'Friend', 'CBE Birr account']
    );
  });
});
