import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculate6MonthSpendTrend } from './spendTrend';
import { ServiceLink } from '../types';

describe('Spend Trend 6-Month Calculation Logic', () => {
  const mockRefDate = new Date('2026-10-26T12:00:00Z');

  it('generates exactly 6 consecutive chronological monthly data points ending at current month', () => {
    const services: ServiceLink[] = [];
    const trend = calculate6MonthSpendTrend(services, { refDate: mockRefDate });

    assert.equal(trend.points.length, 6);
    assert.equal(trend.points[0].shortLabel, 'May');
    assert.equal(trend.points[5].shortLabel, 'Oct');
    assert.equal(trend.points[5].monthKey, '2026-10');
  });

  it('accurately calculates monthly amortized costs and growth across 6 months', () => {
    const services: ServiceLink[] = [
      {
        id: 's1',
        workspaceId: 'w1',
        productId: 'p1',
        environmentType: 'production',
        category: 'hosting',
        providerName: 'AWS Pro',
        accountEmail: 'devops@test.com',
        loginUrl: 'https://aws.amazon.com',
        plan: 'Compute',
        billingCycle: 'monthly',
        cost: 100, // $100/mo active all 6 months
        currency: 'USD',
        autoRenew: true,
        paymentMethodLabel: 'Visa 4242',
        notes: 'Primary cluster',
        status: 'active',
        vaultRefs: [],
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 's2',
        workspaceId: 'w1',
        productId: 'p1',
        environmentType: 'production',
        category: 'database',
        providerName: 'Supabase',
        accountEmail: 'devops@test.com',
        loginUrl: 'https://supabase.com',
        plan: 'Pro',
        billingCycle: 'monthly',
        cost: 25, // added in August 2026
        currency: 'USD',
        autoRenew: true,
        paymentMethodLabel: 'Mastercard 1234',
        notes: 'Database instance',
        status: 'active',
        vaultRefs: [],
        createdAt: '2026-08-10T10:00:00Z',
      },
      {
        id: 's3',
        workspaceId: 'w1',
        productId: 'p1',
        environmentType: 'production',
        category: 'domain registrar',
        providerName: 'Namecheap',
        accountEmail: 'ops@test.com',
        loginUrl: 'https://namecheap.com',
        plan: 'Domain',
        billingCycle: 'yearly',
        cost: 120, // $120/year = $10/mo amortized, added in October
        currency: 'USD',
        autoRenew: true,
        paymentMethodLabel: 'Visa 4242',
        notes: 'Annual domain renewal',
        status: 'active',
        vaultRefs: [],
        createdAt: '2026-10-05T00:00:00Z',
      },
    ];

    const trend = calculate6MonthSpendTrend(services, { refDate: mockRefDate });

    // May, Jun, Jul: only s1 active ($100)
    assert.equal(trend.points[0].totalUsd, 100);
    assert.equal(trend.points[1].totalUsd, 100);
    assert.equal(trend.points[2].totalUsd, 100);

    // Aug, Sep: s1 ($100) + s2 ($25) = $125
    assert.equal(trend.points[3].totalUsd, 125);
    assert.equal(trend.points[4].totalUsd, 125);

    // Oct: s1 ($100) + s2 ($25) + s3 ($10) = $135
    assert.equal(trend.points[5].totalUsd, 135);

    // Growth percentage: (135 - 100) / 100 = +35.0%
    assert.equal(trend.growthPercentage, 35);
    assert.equal(trend.netChangeUsd, 35);
    assert.equal(trend.startMonthlyUsd, 100);
    assert.equal(trend.currentMonthlyUsd, 135);
    assert.equal(trend.peakMonth.shortLabel, 'Oct');
    assert.equal(trend.peakMonth.amountUsd, 135);
  });

  it('correctly converts ETB services to USD at current exchange rate', () => {
    const services: ServiceLink[] = [
      {
        id: 's1',
        workspaceId: 'w1',
        productId: 'p1',
        environmentType: 'production',
        category: 'SMS',
        providerName: "Africa's Talking",
        accountEmail: 'sms@test.com',
        loginUrl: 'https://africastalking.com',
        plan: 'SMS Pack',
        billingCycle: 'monthly',
        cost: 2600, // 2600 ETB / 130 = $20 USD
        currency: 'ETB',
        autoRenew: true,
        paymentMethodLabel: 'Telebirr',
        notes: 'SMS bundle',
        status: 'active',
        vaultRefs: [],
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    const trend = calculate6MonthSpendTrend(services, {
      refDate: mockRefDate,
      exchangeRateEtbPerUsd: 130,
    });

    assert.equal(trend.points[5].totalUsd, 20);
    assert.equal(trend.points[5].totalEtb, 2600);
  });
});
