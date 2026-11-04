import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDomainFromText,
  calculateDomainCountdown,
  extractDomainItems,
  advanceDomainYear,
} from './domainExpiry';
import { ServiceLink, ImportantDate, Product } from '../types';

describe('Domain Expiry & Countdown Timer Logic', () => {
  it('extractDomainFromText correctly identifies domain names from strings', () => {
    assert.equal(extractDomainFromText('Minimart.et domain grace period expiration'), 'minimart.et');
    assert.equal(extractDomainFromText('DNS and SSL for pharmaflow.io web app'), 'pharmaflow.io');
    assert.equal(extractDomainFromText('https://pos.quickbite.io/login'), 'quickbite.io');
    assert.equal(extractDomainFromText('Random text without domain'), null);
  });

  it('calculateDomainCountdown accurately determines overdue state and live ticker values', () => {
    const refDate = new Date('2026-10-26T12:00:00Z');

    // Due date was 2026-10-24 (2 days ago)
    const overdueResult = calculateDomainCountdown('2026-10-24', refDate);
    assert.equal(overdueResult.isOverdue, true);
    assert.equal(overdueResult.urgency, 'critical');
    assert.match(overdueResult.urgencyLabel, /Grace Period/);
    assert.match(overdueResult.formattedString, /Overdue by/);

    // Due date in 3 days (2026-10-29)
    const imminentResult = calculateDomainCountdown('2026-10-29', refDate);
    assert.equal(imminentResult.isOverdue, false);
    assert.equal(imminentResult.urgency, 'critical');
    assert.match(imminentResult.formattedString, /remaining/);

    // Due date in 25 days (2026-11-20)
    const warningResult = calculateDomainCountdown('2026-11-20', refDate);
    assert.equal(warningResult.isOverdue, false);
    assert.equal(warningResult.urgency, 'warning');

    // Due date in 90 days (2027-01-24)
    const safeResult = calculateDomainCountdown('2027-01-24', refDate);
    assert.equal(safeResult.isOverdue, false);
    assert.equal(safeResult.urgency, 'safe');
  });

  it('extractDomainItems correctly merges important dates and registrar services without duplicates', () => {
    const mockProducts: Product[] = [
      {
        id: 'p1',
        workspaceId: 'ws1',
        name: 'MiniMart ERP',
        description: 'Retail inventory',
        status: 'live',
        tags: [],
        environments: [],
        createdAt: '2026-01-01',
      },
    ];

    const mockServices: ServiceLink[] = [
      {
        id: 's1',
        workspaceId: 'ws1',
        productId: 'p1',
        environmentType: 'production',
        category: 'domain registrar',
        providerName: 'Namecheap',
        accountEmail: 'admin@minimart.et',
        loginUrl: 'https://namecheap.com',
        plan: '.et registrar',
        billingCycle: 'yearly',
        cost: 3900,
        currency: 'ETB',
        renewalDate: '2026-10-24',
        autoRenew: false,
        paymentMethodLabel: 'CBE Birr',
        notes: 'Local domain minimart.et',
        status: 'active',
        vaultRefs: [],
        createdAt: '2026-01-01',
      },
    ];

    const mockDates: ImportantDate[] = [
      {
        id: 'd1',
        workspaceId: 'ws1',
        productId: 'p1',
        serviceLinkId: 's1',
        type: 'domain expiry',
        title: 'Minimart.et domain grace period expiration',
        dueDate: '2026-10-24',
        recurrence: 'yearly',
        status: 'open',
        source: 'manual',
        createdAt: '2026-01-01',
      },
    ];

    const items = extractDomainItems(mockServices, mockDates, mockProducts);
    assert.equal(items.length, 1, 'Should de-duplicate service linked with date');
    assert.equal(items[0].domainName, 'minimart.et');
    assert.equal(items[0].provider, 'Namecheap');
    assert.equal(items[0].autoRenew, false);
  });

  it('advanceDomainYear increments year correctly', () => {
    assert.equal(advanceDomainYear('2026-10-24'), '2027-10-24');
    assert.equal(advanceDomainYear('2026-02-28'), '2027-02-28');
  });
});
