import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMonthlyCost,
  convertCurrency,
  calculateTotalMonthlyCost,
  calculateProviderConcentration,
} from './cost';
import { ServiceLink } from '../types';

test('calculateMonthlyCost handles monthly, yearly, and free cycles correctly', () => {
  assert.equal(calculateMonthlyCost(20, 'monthly'), 20);
  assert.equal(calculateMonthlyCost(120, 'yearly'), 10);
  assert.equal(calculateMonthlyCost(50, 'usage-based'), 50);
  assert.equal(calculateMonthlyCost(100, 'one-time'), 0);
  assert.equal(calculateMonthlyCost(0, 'free'), 0);
  assert.equal(calculateMonthlyCost(-10, 'monthly'), 0);
});

test('convertCurrency converts USD to ETB and ETB to USD accurately', () => {
  const etbPerUsd = 130;
  // USD to ETB: $100 * 130 = 13000 ETB
  assert.equal(convertCurrency(100, 'USD', 'ETB', etbPerUsd), 13000);
  // ETB to USD: 2600 ETB / 130 = $20 USD
  assert.equal(convertCurrency(2600, 'ETB', 'USD', etbPerUsd), 20);
  // Same currency: no change
  assert.equal(convertCurrency(50, 'USD', 'USD', etbPerUsd), 50);
  assert.equal(convertCurrency(500, 'ETB', 'ETB', etbPerUsd), 500);
});

test('calculateTotalMonthlyCost aggregates mixed USD and ETB services', () => {
  const etbPerUsd = 130;
  const mockServices: ServiceLink[] = [
    {
      id: '1',
      workspaceId: 'ws1',
      productId: 'p1',
      environmentType: 'production',
      category: 'hosting',
      providerName: 'Vercel',
      accountEmail: 'owner@example.com',
      loginUrl: 'https://vercel.com',
      plan: 'Pro',
      billingCycle: 'monthly',
      cost: 20, // $20 USD / mo
      currency: 'USD',
      autoRenew: true,
      paymentMethodLabel: 'Visa 1234',
      notes: '',
      status: 'active',
      vaultRefs: [],
      createdAt: '2026-01-01',
    },
    {
      id: '2',
      workspaceId: 'ws1',
      productId: 'p1',
      environmentType: 'production',
      category: 'domain registrar',
      providerName: 'Namecheap',
      accountEmail: 'owner@example.com',
      loginUrl: 'https://namecheap.com',
      plan: 'Standard',
      billingCycle: 'yearly',
      cost: 120, // $120 USD / yr = $10 / mo
      currency: 'USD',
      autoRenew: true,
      paymentMethodLabel: 'Visa 1234',
      notes: '',
      status: 'active',
      vaultRefs: [],
      createdAt: '2026-01-01',
    },
    {
      id: '3',
      workspaceId: 'ws1',
      productId: 'p2',
      environmentType: 'production',
      category: 'SMS',
      providerName: 'LocalSMS',
      accountEmail: 'owner@example.com',
      loginUrl: '',
      plan: 'Payg',
      billingCycle: 'monthly',
      cost: 1300, // 1300 ETB / mo = $10 USD / mo
      currency: 'ETB',
      autoRenew: false,
      paymentMethodLabel: 'Telebirr',
      notes: '',
      status: 'active',
      vaultRefs: [],
      createdAt: '2026-01-01',
    },
    {
      id: '4',
      workspaceId: 'ws1',
      productId: 'p3',
      environmentType: 'production',
      category: 'database',
      providerName: 'OldDB',
      accountEmail: '',
      loginUrl: '',
      plan: '',
      billingCycle: 'monthly',
      cost: 100,
      currency: 'USD',
      autoRenew: false,
      paymentMethodLabel: '',
      notes: '',
      status: 'cancelled', // Ignored!
      vaultRefs: [],
      createdAt: '2026-01-01',
    },
  ];

  // Total USD: 20 (Vercel) + 10 (Namecheap) + 10 (LocalSMS 1300/130) = 40 USD
  // Total ETB: 40 * 130 = 5200 ETB
  const resultUsdBase = calculateTotalMonthlyCost(mockServices, 'USD', etbPerUsd);
  assert.equal(resultUsdBase.totalUsd, 40);
  assert.equal(resultUsdBase.totalEtb, 5200);
  assert.equal(resultUsdBase.totalInBase, 40);

  const resultEtbBase = calculateTotalMonthlyCost(mockServices, 'ETB', etbPerUsd);
  assert.equal(resultEtbBase.totalInBase, 5200);
});

test('calculateProviderConcentration accurately groups and flags dominant providers', () => {
  const etbPerUsd = 130;
  const mockServices: ServiceLink[] = [
    {
      id: 's1',
      workspaceId: 'ws1',
      productId: 'prod1',
      environmentType: 'production',
      category: 'domain registrar',
      providerName: 'Cloudflare',
      accountEmail: '',
      loginUrl: '',
      plan: 'Free',
      billingCycle: 'free',
      cost: 0,
      currency: 'USD',
      autoRenew: true,
      paymentMethodLabel: '',
      notes: '',
      status: 'active',
      vaultRefs: [],
      createdAt: '',
    },
    {
      id: 's2',
      workspaceId: 'ws1',
      productId: 'prod2',
      environmentType: 'production',
      category: 'domain registrar',
      providerName: 'Cloudflare',
      accountEmail: '',
      loginUrl: '',
      plan: 'Pro',
      billingCycle: 'monthly',
      cost: 20,
      currency: 'USD',
      autoRenew: true,
      paymentMethodLabel: '',
      status: 'active',
      vaultRefs: [],
      notes: '',
      createdAt: '',
    },
    {
      id: 's3',
      workspaceId: 'ws1',
      productId: 'prod1',
      environmentType: 'production',
      category: 'database',
      providerName: 'Supabase',
      accountEmail: '',
      loginUrl: '',
      plan: 'Pro',
      billingCycle: 'monthly',
      cost: 25,
      currency: 'USD',
      autoRenew: true,
      paymentMethodLabel: '',
      status: 'active',
      vaultRefs: [],
      notes: '',
      createdAt: '',
    },
  ];

  // 2 total products
  const concentration = calculateProviderConcentration(mockServices, 2, etbPerUsd);
  // Cloudflare is used by prod1 and prod2 -> 2/2 = 100%
  assert.equal(concentration[0].providerName, 'Cloudflare');
  assert.equal(concentration[0].productCount, 2);
  assert.equal(concentration[0].percentage, 100);

  // Supabase is used by prod1 -> 1/2 = 50%
  assert.equal(concentration[1].providerName, 'Supabase');
  assert.equal(concentration[1].productCount, 1);
  assert.equal(concentration[1].percentage, 50);
});
