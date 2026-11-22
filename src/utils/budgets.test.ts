import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetAlerts, budgetUse, paidByAppInMonth } from './budgets';

const services = [
  { id: 's1', productId: 'a' },
  { id: 's2', productId: 'a' },
  { id: 's3', productId: 'b' },
];
const pay = (serviceLinkId: string | undefined, paidOn: string, amount: number, currency: 'USD' | 'ETB' = 'USD') => ({ serviceLinkId, paidOn, amount, currency });

test('budgets: what each app paid in a month, birr at the workspace rate', () => {
  const paid = paidByAppInMonth(
    [pay('s1', '2026-11-02', 20), pay('s2', '2026-11-20', 1500, 'ETB'), pay('s3', '2026-11-05', 7), pay('s1', '2026-10-30', 99), pay(undefined, '2026-11-03', 50), pay('gone', '2026-11-03', 50)],
    services,
    '2026-11',
    150
  );
  assert.deepEqual([...paid.entries()], [['a', 30], ['b', 7]]);
});

test('budgets: level reached', () => {
  assert.equal(budgetUse(null, 50), null);
  assert.equal(budgetUse(0, 50), null);
  assert.deepEqual(budgetUse(100, 79.994), { budget: 100, spent: 79.99, percent: 80, level: 0 });
  assert.equal(budgetUse(100, 80)!.level, 80);
  assert.equal(budgetUse(100, 100)!.level, 100);
  assert.equal(budgetUse(100, 130)!.percent, 130);
});

test('budgets: one alert per app at the highest new level; 100% at once settles 80% too', () => {
  const products = [
    { id: 'a', name: 'SaaS Boss', monthlyBudget: 100 },
    { id: 'b', name: 'Hotel POS', monthlyBudget: 50 },
    { id: 'c', name: 'No budget', monthlyBudget: null },
    { id: 'd', name: 'Under', monthlyBudget: 500 },
  ];
  const paid = new Map([['a', 85], ['b', 60], ['c', 900], ['d', 10]]);
  const none = () => false;
  const alerts = budgetAlerts(products, paid, none, 150);
  assert.deepEqual(alerts.map((a) => [a.productId, a.level, a.covers]), [['a', 80, [80]], ['b', 100, [80, 100]]]);
  assert.equal(alerts[0].text, 'SaaS Boss: $85 (≈ ETB 12,750) paid this month, 85% of its $100 budget.');
  assert.equal(alerts[1].text, 'Hotel POS: $60 (≈ ETB 9,000) paid this month, over its $50 budget (120%).');

  // Already told at 80%: nothing new until 100%.
  const sent = new Set(['a:80']);
  assert.equal(budgetAlerts(products.slice(0, 1), paid, (id, l) => sent.has(`${id}:${l}`), 150).length, 0);
  const later = budgetAlerts(products.slice(0, 1), new Map([['a', 101]]), (id, l) => sent.has(`${id}:${l}`), 150);
  assert.deepEqual(later.map((a) => [a.level, a.covers]), [[100, [100]]]);
});
