import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { DueSoonGroup, Product, ServiceLink } from '../types';
import { dueRows, timelineMarks, monthTicks, monthlyCostByApp, shortDate, dateRange, labelSpan, withTrialEnds } from './timeline';

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

type Item = DueSoonGroup['items'][number];
const renewal = (s: ServiceLink, daysDiff: number, dueDate: string): Item => ({
  id: s.id,
  type: 'renewal',
  title: `${s.providerName} Renewal (${s.plan})`,
  productName: 'StackTrack',
  productId: s.productId,
  dueDate,
  daysDiff,
  amount: s.cost,
  currency: s.currency,
  status: s.status,
  rawServiceItem: s,
});
const dateItem = (id: string, title: string, daysDiff: number, dueDate: string): Item => ({
  id,
  type: 'date',
  title,
  productName: 'StackTrack',
  productId: 'p1',
  dueDate,
  daysDiff,
  dateType: 'domain expiry',
  status: 'open',
});
const groups = (items: Item[]): DueSoonGroup[] => [{ label: 'All', category: 'next30', items }];

describe('dueRows', () => {
  test('sorts soonest first, keeps overdue, drops what is beyond the window', () => {
    const rows = dueRows(
      groups([
        renewal(svc({ id: 'a', providerName: 'Supabase' }), 19, '2026-12-12'),
        renewal(svc({ id: 'b', providerName: 'Old' }), -3, '2026-11-20'),
        renewal(svc({ id: 'c', providerName: 'Far' }), 90, '2027-02-21'),
      ]),
      RATE
    );
    assert.deepEqual(rows.map((r) => r.name), ['Old', 'Supabase']);
  });

  test('says how each renewal is paid', () => {
    const rows = dueRows(
      groups([
        renewal(svc({ id: 'a', providerName: 'Vercel', autoRenew: true }), 1, '2026-11-24'),
        renewal(svc({ id: 'b', providerName: 'Claude API', billingCycle: 'usage-based', autoRenew: true }), 2, '2026-11-25'),
        renewal(svc({ id: 'c', providerName: 'saasboss.io', autoRenew: false, billingCycle: 'yearly' }), 3, '2026-11-26'),
      ]),
      RATE
    );
    assert.deepEqual(rows.map((r) => [r.tone, r.label]), [
      ['auto', 'Auto-renews'],
      ['usage', 'Usage-based'],
      ['manual', 'Renew by hand'],
    ]);
  });

  test('leaves out free and paused services', () => {
    const rows = dueRows(
      groups([
        renewal(svc({ id: 'a', billingCycle: 'free', cost: 0 }), 1, '2026-11-24'),
        renewal(svc({ id: 'b', status: 'paused' }), 1, '2026-11-24'),
      ]),
      RATE
    );
    assert.equal(rows.length, 0);
  });

  test('converts amounts in birr to dollars and back', () => {
    const [row] = dueRows(groups([renewal(svc({ cost: 1600, currency: 'ETB' }), 5, '2026-11-28')]), RATE);
    assert.equal(row.usd, 10);
    assert.equal(row.etb, 1600);
  });

  test('dates keep their title and show their type', () => {
    const [row] = dueRows(groups([dateItem('d1', 'saasboss.io domain', 41, '2027-01-03')]), RATE);
    assert.equal(row.kind, 'date');
    assert.equal(row.name, 'saasboss.io domain');
    assert.equal(row.label, 'Domain expiry');
    assert.equal(row.tone, 'date');
    assert.equal(row.usd, undefined);
  });
});

describe('timelineMarks', () => {
  const rows = dueRows(
    groups([
      renewal(svc({ id: 'a', providerName: 'Claude API', cost: 15 }), 8, '2026-12-01'),
      renewal(svc({ id: 'b', providerName: 'Twilio', cost: 8, autoRenew: false }), 10, '2026-12-03'),
      renewal(svc({ id: 'c', providerName: 'Vercel', cost: 20 }), 14, '2026-12-07'),
      renewal(svc({ id: 'd', providerName: 'Supabase', cost: 25 }), 19, '2026-12-12'),
      renewal(svc({ id: 'late', providerName: 'Late' }), -2, '2026-11-21'),
    ]),
    RATE
  );
  const marks = timelineMarks(rows);

  test('overdue items are not on the line', () => {
    assert.ok(marks.every((m) => m.rows.every((r) => r.daysDiff >= 0)));
  });

  test('items a few days apart share one mark, with the total and a date range', () => {
    assert.equal(marks.length, 3);
    assert.deepEqual(marks[0].rows.map((r) => r.name), ['Claude API', 'Twilio']);
    assert.equal(marks[0].usd, 23);
    assert.equal(marks[0].when, 'Dec 1–3');
  });

  test('a shared mark shows the kind that needs you most', () => {
    assert.equal(marks[0].tone, 'manual');
    assert.equal(marks[1].tone, 'auto');
  });

  test('marks alternate above and below, placed by day', () => {
    assert.deepEqual(marks.map((m) => m.side), ['above', 'below', 'above']);
    assert.equal(marks[1].at, 14 / 60);
  });

  test('labels at the ends line up with the dot', () => {
    const edge = timelineMarks(
      dueRows(
        groups([
          renewal(svc({ id: 'a' }), 0, '2026-11-23'),
          renewal(svc({ id: 'b' }), 30, '2026-12-23'),
          renewal(svc({ id: 'c' }), 59, '2027-01-21'),
        ]),
        RATE
      )
    );
    assert.deepEqual(edge.map((m) => m.align), ['start', 'center', 'end']);
  });

  test('labels on the same side never overlap, however crowded the line is', () => {
    const patterns = [
      [3, 8, 13, 20, 24, 40], // the demo workspace: a group near today, then more a few days apart
      Array.from({ length: 30 }, (_, i) => i * 2),
      Array.from({ length: 61 }, (_, i) => i),
      [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60],
      [1, 2, 9, 10, 11, 19, 58, 59, 60],
    ];
    for (const days of patterns) {
      const ms = timelineMarks(
        dueRows(groups(days.map((d, i) => renewal(svc({ id: `s${i}`, providerName: `S${i}` }), d, '2026-12-01'))), RATE)
      );
      assert.equal(ms.reduce((n, m) => n + m.rows.length, 0), days.length, 'every item is on the line');
      for (const side of ['above', 'below'] as const) {
        const spans = ms.filter((m) => m.side === side).map((m) => labelSpan(m.at, m.align));
        for (let i = 1; i < spans.length; i++) {
          assert.ok(spans[i][0] >= spans[i - 1][1], `${side} labels ${i - 1} and ${i} overlap for [${days}]`);
        }
      }
      for (const m of ms) {
        const [from, to] = labelSpan(m.at, m.align);
        assert.ok(from >= 0 && to <= 1 + 1e-9, `label at ${m.at} stays on the line`);
      }
    }
  });

  test('a wider line fits more separate marks, still without overlaps', () => {
    const days = [3, 8, 13, 15, 18, 20, 24, 40];
    const rowsFor = () =>
      dueRows(groups(days.map((d, i) => renewal(svc({ id: `s${i}`, providerName: `S${i}` }), d, '2026-12-01'))), RATE);
    const narrow = timelineMarks(rowsFor());
    const wide = timelineMarks(rowsFor(), 60, 4, 132 / 1150);
    assert.ok(wide.length > narrow.length, `${wide.length} marks on a wide line, ${narrow.length} on a narrow one`);
    for (const side of ['above', 'below'] as const) {
      const spans = wide.filter((m) => m.side === side).map((m) => labelSpan(m.at, m.align, 132 / 1150));
      for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] >= spans[i - 1][1]);
    }
  });

  test('a label with no room on either side joins the mark before it', () => {
    const ms = timelineMarks(
      dueRows(
        groups([
          renewal(svc({ id: 'a', providerName: 'A' }), 3, '2026-11-26'),
          renewal(svc({ id: 'b', providerName: 'B' }), 8, '2026-12-01'),
          renewal(svc({ id: 'c', providerName: 'C' }), 13, '2026-12-06'),
        ]),
        RATE
      )
    );
    assert.deepEqual(
      ms.map((m) => [m.rows.map((r) => r.name).join(''), m.side]),
      [
        ['A', 'above'],
        ['BC', 'below'],
      ]
    );
  });
});

describe('dates and months', () => {
  test('short dates and ranges', () => {
    assert.equal(shortDate('2026-12-01'), 'Dec 1');
    assert.equal(dateRange('2026-12-01', '2026-12-01'), 'Dec 1');
    assert.equal(dateRange('2026-12-01', '2026-12-04'), 'Dec 1–4');
    assert.equal(dateRange('2026-11-29', '2026-12-02'), 'Nov 29–Dec 2');
  });

  test('month ticks inside a 60-day window from Nov 23', () => {
    assert.deepEqual(monthTicks('2026-11-23'), [
      { at: 8 / 60, label: 'December' },
      { at: 39 / 60, label: 'January' },
    ]);
  });

  test('a month starting right at the end of the window is not labelled', () => {
    assert.deepEqual(
      monthTicks('2026-12-03').map((t) => t.label),
      ['January']
    );
  });
});

describe('monthlyCostByApp', () => {
  const products = [
    { id: 'p1', name: 'StackTrack' },
    { id: 'p2', name: 'YG Retails' },
  ] as Product[];

  test('adds monthly, yearly/12, usage-based and birr; skips cancelled; most expensive first', () => {
    const costs = monthlyCostByApp(
      products,
      [
        svc({ id: 'a', productId: 'p2', cost: 7.2 }),
        svc({ id: 'b', productId: 'p1', cost: 20 }),
        svc({ id: 'c', productId: 'p1', cost: 120, billingCycle: 'yearly' }),
        svc({ id: 'd', productId: 'p1', cost: 1600, currency: 'ETB' }),
        svc({ id: 'e', productId: 'p1', cost: 99, status: 'cancelled' }),
        svc({ id: 'f', productId: 'p2', cost: 15, billingCycle: 'usage-based' }),
        svc({ id: 'g', productId: 'p2', cost: 0, billingCycle: 'free' }),
      ],
      RATE
    );
    assert.deepEqual(
      costs.map((c) => [c.product.name, c.monthlyUsd, c.serviceCount]),
      [
        ['StackTrack', 40, 3],
        ['YG Retails', 22.2, 3],
      ]
    );
    assert.equal(costs[0].monthlyEtb, 6400);
  });
});

describe('withTrialEnds', () => {
  const products = [{ id: 'p1', name: 'StackTrack' }];
  test('a trial goes on the day it ends, even with no renewal date; others stay as they are', () => {
    const rows = dueRows(
      groups([renewal(svc({ id: 't1', providerName: 'Resend', status: 'trial', trialEndsAt: '2026-11-28' }), 20, '2026-12-13'), renewal(svc({ id: 'v' }), 3, '2026-11-26')]),
      RATE
    );
    const out = withTrialEnds(
      rows,
      [
        svc({ id: 't1', providerName: 'Resend', status: 'trial', trialEndsAt: '2026-11-28', renewalDate: '2026-12-13' }),
        svc({ id: 't2', providerName: 'Neon', status: 'trial', trialEndsAt: '2026-12-01', renewalDate: undefined }),
        svc({ id: 't3', providerName: 'Far', status: 'trial', trialEndsAt: '2027-06-01' }),
        svc({ id: 'v' }),
      ],
      products,
      '2026-11-23',
      60
    );
    assert.deepEqual(
      out.map((r) => [r.id, r.dueDate, r.daysDiff, r.label]),
      [
        ['v', '2026-11-26', 3, 'Auto-renews'],
        ['t1', '2026-11-28', 5, 'Trial ends'],
        ['t2', '2026-12-01', 8, 'Trial ends'],
      ]
    );
  });
});
