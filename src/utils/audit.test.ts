import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateStackHealth, calculateMonthlyCashflowForecast } from './audit';
import { ServiceLink, ImportantDate, Product } from '../types';
import { ProviderConcentrationStat } from './cost';

describe('SaaS Stack Health & Audit Logic', () => {
  const sampleProducts: Product[] = [
    {
      id: 'p1',
      workspaceId: 'ws1',
      name: 'Alpha SaaS',
      description: 'Alpha SaaS product',
      status: 'live',
      tags: ['saas'],
      environments: [],
      createdAt: '2026-01-01',
    },
    {
      id: 'p2',
      workspaceId: 'ws1',
      name: 'Beta SaaS',
      description: 'Beta SaaS product',
      status: 'live',
      tags: ['b2b'],
      environments: [],
      createdAt: '2026-01-01',
    },
  ];

  const sampleServices: ServiceLink[] = [
    {
      id: 's1',
      workspaceId: 'ws1',
      productId: 'p1',
      environmentType: 'production',
      category: 'hosting',
      providerName: 'Hetzner',
      accountEmail: 'dev@alpha.io',
      loginUrl: 'https://console.hetzner.cloud',
      paymentMethodLabel: 'Visa 4417',
      plan: 'CPX21',
      billingCycle: 'monthly',
      cost: 15,
      currency: 'USD',
      autoRenew: true,
      renewalDate: '2026-11-01',
      status: 'active',
      vaultRefs: [
        {
          vaultItemId: 'vault_hetzner_01',
          label: 'Hetzner Root Token',
          environment: 'production',
        },
      ],
      notes: 'Clean notes referencing vault item vault_hetzner_01',
      createdAt: '2026-01-01',
    },
    {
      id: 's2',
      workspaceId: 'ws1',
      productId: 'p1',
      environmentType: 'production',
      category: 'domain registrar',
      providerName: 'Namecheap',
      accountEmail: 'dev@alpha.io',
      loginUrl: 'https://namecheap.com',
      paymentMethodLabel: 'Visa 4417',
      plan: 'Domain registration',
      billingCycle: 'yearly',
      cost: 14,
      currency: 'USD',
      autoRenew: true,
      renewalDate: '2026-12-15',
      status: 'active',
      vaultRefs: [],
      notes: 'No secret inside',
      createdAt: '2026-01-01',
    },
  ];

  const sampleDates: ImportantDate[] = [
    {
      id: 'd1',
      workspaceId: 'ws1',
      title: 'SSL Certificate Renewal',
      dueDate: '2026-11-20',
      type: 'SSL expiry',
      recurrence: 'yearly',
      status: 'open',
      source: 'manual',
      createdAt: '2026-01-01',
    },
  ];

  test('calculates optimal score for clean stack without secrets or overdue items', () => {
    const concentrations: ProviderConcentrationStat[] = [
      {
        providerName: 'Hetzner',
        productCount: 1,
        totalProducts: 2,
        percentage: 50,
        serviceCount: 1,
        categories: ['hosting'],
        monthlyCostUsd: 15,
      },
    ];
    const report = calculateStackHealth(sampleServices, sampleDates, sampleProducts, concentrations);
    assert.ok(report.score >= 80, `Expected score >= 80, got ${report.score}`);
    assert.strictEqual(report.unprotectedSecretsCount, 0);
  });

  test('detects secret leak in notes and penalizes score', () => {
    const dirtyServices: ServiceLink[] = [
      {
        ...sampleServices[0],
        notes: 'Api token: sk_' + 'live_51ABCDEF0123456789SecretKeyHere',
      },
    ];
    const report = calculateStackHealth(dirtyServices, sampleDates, sampleProducts, []);
    assert.strictEqual(report.unprotectedSecretsCount, 1);
    const secretCheck = report.checks.find((c) => c.id === 'secret-shield');
    assert.ok(secretCheck && secretCheck.score < 25);
  });

  test('projects 12-month cashflow with monthly and annual renewals', () => {
    const forecast = calculateMonthlyCashflowForecast(sampleServices, 'USD', 130, 12);
    assert.strictEqual(forecast.length, 12);
    assert.ok(forecast[0].totalUsd > 0);
  });
});
