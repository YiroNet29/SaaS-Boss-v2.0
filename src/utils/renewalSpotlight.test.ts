import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDaysRemaining,
  getRenewalUrgency,
  getExpiringServices,
} from './renewalSpotlight';
import { ServiceLink, Product } from '../types';

describe('Renewal Spotlight Logic', () => {
  const mockRefDate = new Date('2026-10-26T12:00:00Z');

  it('calculateDaysRemaining accurately calculates past, today, and future dates', () => {
    // 5 days in future
    assert.equal(calculateDaysRemaining('2026-10-31', mockRefDate), 5);
    // Today
    assert.equal(calculateDaysRemaining('2026-10-26', mockRefDate), 0);
    // 3 days overdue
    assert.equal(calculateDaysRemaining('2026-10-23', mockRefDate), -3);
  });

  it('getRenewalUrgency assigns proper status level and labels', () => {
    // Overdue
    const overdue = getRenewalUrgency(-2, false, false, 20);
    assert.equal(overdue.level, 'overdue');
    assert.match(overdue.label, /Overdue/);

    // Due today
    const today = getRenewalUrgency(0, false, false, 20);
    assert.equal(today.level, 'imminent');
    assert.equal(today.label, 'Renews Today');

    // Imminent (3 days)
    const imminent = getRenewalUrgency(3, false, false, 20);
    assert.equal(imminent.level, 'imminent');
    assert.equal(imminent.label, 'In 3 days');

    // Upcoming (10 days)
    const upcoming = getRenewalUrgency(10, false, false, 20);
    assert.equal(upcoming.level, 'upcoming');

    // Normal (25 days)
    const normal = getRenewalUrgency(25, false, false, 20);
    assert.equal(normal.level, 'normal');
  });

  it('getExpiringServices filters, prioritizes, and computes exposure correctly', () => {
    const products: Product[] = [
      {
        id: 'p1',
        workspaceId: 'w1',
        name: 'OmniFlow SaaS',
        description: 'B2B automation platform',
        status: 'live',
        tags: ['saas'],
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
        providerName: 'AWS Pro Compute',
        accountEmail: 'devops@omniflow.com',
        loginUrl: 'https://aws.amazon.com',
        plan: 'Dedicated Cluster',
        billingCycle: 'monthly',
        cost: 120,
        currency: 'USD',
        renewalDate: '2026-10-29', // In 3 days (imminent + high impact)
        autoRenew: true,
        paymentMethodLabel: 'Visa 4242',
        notes: 'Critical cluster',
        status: 'active',
        vaultRefs: [],
        createdAt: '2026-01-01',
      },
      {
        id: 's2',
        workspaceId: 'w1',
        productId: 'p1',
        environmentType: 'production',
        category: 'auth',
        providerName: 'Clerk Auth',
        accountEmail: 'admin@omniflow.com',
        loginUrl: 'https://clerk.dev',
        plan: 'Pro',
        billingCycle: 'monthly',
        cost: 25,
        currency: 'USD',
        trialEndsAt: '2026-10-27', // Tomorrow (trial imminent)
        autoRenew: false,
        paymentMethodLabel: 'Mastercard 1234',
        notes: 'Trial expiring',
        status: 'trial',
        vaultRefs: [],
        createdAt: '2026-01-01',
      },
      {
        id: 's3',
        workspaceId: 'w1',
        productId: 'p1',
        environmentType: 'production',
        category: 'email provider',
        providerName: 'Resend',
        accountEmail: 'mail@omniflow.com',
        loginUrl: 'https://resend.com',
        plan: 'Growth',
        billingCycle: 'monthly',
        cost: 20,
        currency: 'USD',
        renewalDate: '2026-11-20', // In 25 days (within 30 days)
        autoRenew: true,
        paymentMethodLabel: 'Visa 4242',
        notes: 'Transactional email',
        status: 'active',
        vaultRefs: [],
        createdAt: '2026-01-01',
      },
      {
        id: 's4',
        workspaceId: 'w1',
        productId: 'p1',
        environmentType: 'production',
        category: 'domain registrar',
        providerName: 'Namecheap',
        accountEmail: 'ops@omniflow.com',
        loginUrl: 'https://namecheap.com',
        plan: 'Domain',
        billingCycle: 'yearly',
        cost: 15,
        currency: 'USD',
        renewalDate: '2027-04-10', // Far in future (> 30 days)
        autoRenew: true,
        paymentMethodLabel: 'Visa 4242',
        notes: 'Far renewal',
        status: 'active',
        vaultRefs: [],
        createdAt: '2026-01-01',
      },
      {
        id: 's5',
        workspaceId: 'w1',
        productId: 'p1',
        environmentType: 'production',
        category: 'analytics',
        providerName: 'PostHog',
        accountEmail: 'analytics@omniflow.com',
        loginUrl: 'https://posthog.com',
        plan: 'Scale',
        billingCycle: 'monthly',
        cost: 50,
        currency: 'USD',
        renewalDate: '2026-10-24', // 2 days overdue!
        autoRenew: false,
        paymentMethodLabel: 'Visa 4242',
        notes: 'Invoice pending',
        status: 'active',
        vaultRefs: [],
        createdAt: '2026-01-01',
      },
    ];

    const result = getExpiringServices(services, products, { refDate: mockRefDate });

    // s4 is beyond 30 days, so 4 items expected (s5 overdue, s2 trial tomorrow, s1 in 3d, s3 in 25d)
    assert.equal(result.totalExpiringCount, 4);

    // Overdue item s5 should be top priority
    assert.equal(result.items[0].service.providerName, 'PostHog');
    assert.equal(result.items[0].statusLevel, 'overdue');

    // Imminent count: s5 (overdue), s2 (1 day), s1 (3 days) = 3
    assert.equal(result.imminentCount, 3);
    assert.equal(result.trialCount, 1);

    // Total exposure: s1 (120) + s2 (25) + s3 (20) + s5 (50) = 215
    assert.equal(result.totalExposureUsd, 215);
  });
});
