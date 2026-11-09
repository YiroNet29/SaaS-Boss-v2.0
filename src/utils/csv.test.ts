import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  exportServicesToCSV,
  calculateAmortizedCost,
  parseCSV,
} from './csv';
import { Product, ServiceLink } from '../types';

describe('CSV Export & Parse Accounting Utilities', () => {
  it('calculateAmortizedCost calculates monthly USD/ETB and annual USD correctly', () => {
    // 1. Yearly $120 USD plan -> $10/mo USD, 1300 ETB/mo, $120/yr USD
    const yearly = calculateAmortizedCost(120, 'yearly', 'USD', 130);
    assert.equal(yearly.monthlyUsd, 10);
    assert.equal(yearly.monthlyEtb, 1300);
    assert.equal(yearly.annualUsd, 120);

    // 2. Monthly 2600 ETB plan -> 20 USD/mo (@ 130 rate), 2600 ETB/mo, $240/yr USD
    const etbMonthly = calculateAmortizedCost(2600, 'monthly', 'ETB', 130);
    assert.equal(etbMonthly.monthlyUsd, 20);
    assert.equal(etbMonthly.monthlyEtb, 2600);
    assert.equal(etbMonthly.annualUsd, 240);

    // 3. Free plan -> $0
    const freePlan = calculateAmortizedCost(0, 'free', 'USD', 130);
    assert.equal(freePlan.monthlyUsd, 0);
    assert.equal(freePlan.annualUsd, 0);
  });

  it('exportServicesToCSV includes accounting headers and properly formatted rows', () => {
    const products: Product[] = [
      {
        id: 'p1',
        workspaceId: 'w1',
        name: 'PharmaFlow SaaS',
        description: 'Hospital pharmacy ERP',
        status: 'live',
        tags: [],
        environments: [],
        createdAt: '2026-01-01',
      },
    ];

    const services: ServiceLink[] = [
      {
        id: 's1',
        workspaceId: 'w1',
        productId: 'p1',
        environmentType: 'production',
        category: 'hosting',
        providerName: 'Vercel, Inc.',
        accountEmail: 'admin@pharmaflow.io',
        loginUrl: 'https://vercel.com',
        plan: 'Pro Team',
        billingCycle: 'monthly',
        cost: 20,
        currency: 'USD',
        renewalDate: '2026-11-01',
        autoRenew: true,
        paymentMethodLabel: 'Visa ending 4417',
        notes: 'Includes serverless edge functions',
        status: 'active',
        vaultRefs: [{ vaultItemId: 'v1', label: 'Key', environment: 'production' }],
        createdAt: '2026-08-01',
      },
    ];

    const csvOutput = exportServicesToCSV(products, services, 130);
    const lines = csvOutput.split('\n');

    // Header check
    assert.match(lines[0], /ProductName,Environment,Category,Provider,Plan/);
    assert.match(lines[0], /MonthlyCostUSD,MonthlyCostETB,AnnualCostUSD/);

    // Row check: provider with comma is quoted
    assert.match(lines[1], /"Vercel, Inc."/);
    assert.match(lines[1], /PharmaFlow SaaS/);
    assert.match(lines[1], /Yes/); // AutoRenew is "Yes"
  });

  it('parseCSV handles commas, quotes, and newlines', () => {
    const raw = 'Name,Cost,Notes\n"Alpha, Inc.",50,"Special, with ""quotes"""';
    const parsed = parseCSV(raw);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[1][0], 'Alpha, Inc.');
    assert.equal(parsed[1][1], '50');
    assert.equal(parsed[1][2], 'Special, with "quotes"');
  });
});
