import { Product, ServiceLink, Currency, ServiceCategory, BillingCycle, ServiceStatus, ProductStatus } from '../types';
import { FALLBACK_ETB_PER_USD } from './fx';

/**
 * Escapes a single CSV cell string.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeCSV(value: any): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  // A cell starting with = + - @ (or a tab/return) runs as a formula in Excel or Sheets. Text such as a
  // vendor name read from someone's receipt email could do that, so it gets a leading apostrophe, which
  // spreadsheets show as plain text. Numbers like -5 are left alone; the importer drops the apostrophe.
  if (typeof value !== 'number' && FORMULA_START.test(str) && !Number.isFinite(Number(str))) str = `'${str}`;
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Calculates monthly and annual amortized costs for accounting.
 */
export function calculateAmortizedCost(
  cost: number,
  billingCycle: BillingCycle,
  currency: Currency,
  exchangeRate: number = 130
): { monthlyUsd: number; monthlyEtb: number; annualUsd: number } {
  let monthlyBase = 0;
  if (billingCycle === 'yearly') {
    monthlyBase = cost / 12;
  } else if (billingCycle === 'monthly' || billingCycle === 'usage-based') {
    monthlyBase = cost;
  }

  const monthlyUsd =
    currency === 'ETB'
      ? Math.round((monthlyBase / (exchangeRate || FALLBACK_ETB_PER_USD)) * 100) / 100
      : Math.round(monthlyBase * 100) / 100;

  const monthlyEtb =
    currency === 'ETB'
      ? Math.round(monthlyBase * 100) / 100
      : Math.round(monthlyBase * (exchangeRate || FALLBACK_ETB_PER_USD) * 100) / 100;

  const annualUsd = Math.round(monthlyUsd * 12 * 100) / 100;

  return { monthlyUsd, monthlyEtb, annualUsd };
}

/**
 * Exports products and their service links to CSV with accounting and backup columns.
 */
export function exportServicesToCSV(
  products: Product[],
  services: ServiceLink[],
  exchangeRate: number = 130
): string {
  const prodMap = new Map<string, string>();
  for (const p of products) {
    prodMap.set(p.id, p.name);
  }

  const headers = [
    'ProductName',
    'Environment',
    'Category',
    'Provider',
    'Plan',
    'BillingCycle',
    'Cost',
    'Currency',
    'MonthlyCostUSD',
    'MonthlyCostETB',
    'AnnualCostUSD',
    'RenewalDate',
    'AutoRenew',
    'PaymentMethod',
    'AccountEmail',
    'LoginUrl',
    'Status',
    'Notes',
    'VaultRefsCount',
    'CreatedAt',
  ];

  const rows = services.map((s) => {
    const { monthlyUsd, monthlyEtb, annualUsd } = calculateAmortizedCost(
      s.cost,
      s.billingCycle,
      s.currency,
      exchangeRate
    );

    return [
      escapeCSV(prodMap.get(s.productId) || 'Unknown'),
      escapeCSV(s.environmentType),
      escapeCSV(s.category),
      escapeCSV(s.providerName),
      escapeCSV(s.plan),
      escapeCSV(s.billingCycle),
      escapeCSV(s.cost),
      escapeCSV(s.currency),
      escapeCSV(monthlyUsd),
      escapeCSV(monthlyEtb),
      escapeCSV(annualUsd),
      escapeCSV(s.renewalDate || ''),
      escapeCSV(s.autoRenew ? 'Yes' : 'No'),
      escapeCSV(s.paymentMethodLabel),
      escapeCSV(s.accountEmail),
      escapeCSV(s.loginUrl),
      escapeCSV(s.status),
      escapeCSV(s.notes),
      escapeCSV(s.vaultRefs?.length || 0),
      escapeCSV(s.createdAt || ''),
    ];
  });

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}


/**
 * Downloads arbitrary text as a file.
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/plain'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Parses simple CSV rows.
 */
/** Drops the apostrophe escapeCSV puts in front of formula-like text, so an export imports back as it was. */
const unguard = (cell: string) => (/^'[=+\-@\t\r]/.test(cell) ? cell.slice(1) : cell);

export function parseCSV(csvText: string): string[][] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const result: string[][] = [];

  for (const line of lines) {
    const row: string[] = [];
    let insideQuote = false;
    let entry = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuote && line[i + 1] === '"') {
          entry += '"';
          i++;
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === ',' && !insideQuote) {
        row.push(unguard(entry.trim()));
        entry = '';
      } else {
        entry += char;
      }
    }
    row.push(unguard(entry.trim()));
    result.push(row);
  }

  return result;
}

export interface ParsedImportRow {
  productName: string;
  category: ServiceCategory;
  providerName: string;
  cost: number;
  currency: Currency;
  billingCycle: BillingCycle;
  environmentType: 'dev' | 'staging' | 'production';
  plan: string;
  renewalDate?: string;
  autoRenew: boolean;
  status: ServiceStatus;
  paymentMethodLabel: string;
  accountEmail: string;
  loginUrl: string;
  notes: string;
  /** About the app itself, used only when the import creates it. Any one of the app's rows can carry them. */
  appStatus?: ProductStatus;
  appTags?: string[];
  liveUrl?: string;
  repoUrl?: string;
  appDescription?: string;
}

const SERVICE_CATEGORIES: ServiceCategory[] = [
  'hosting', 'domain registrar', 'database', 'email provider', 'payment processor', 'auth', 'analytics',
  'error monitoring', 'Google API', 'Telegram API', 'DB API', 'storage', 'SMS', 'other',
];
const CATEGORY_WORDS: Record<string, ServiceCategory> = {
  domain: 'domain registrar', registrar: 'domain registrar', email: 'email provider', payment: 'payment processor',
  payments: 'payment processor', google: 'Google API', telegram: 'Telegram API', monitoring: 'error monitoring',
};
const BILLING_CYCLES: BillingCycle[] = ['monthly', 'yearly', 'one-time', 'usage-based', 'free'];
const BILLING_WORDS: Record<string, BillingCycle> = {
  month: 'monthly', year: 'yearly', annual: 'yearly', annually: 'yearly', once: 'one-time', usage: 'usage-based',
};
const SERVICE_STATUSES: ServiceStatus[] = ['active', 'trial', 'paused', 'cancelled'];
const APP_STATUSES: ProductStatus[] = ['idea', 'building', 'live', 'paused', 'retired'];
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** A category as the app spells it, whatever the case or spacing ("google api" → "Google API"); unknown → "other". */
export function toCategory(raw: string): ServiceCategory {
  const k = squash(raw);
  return SERVICE_CATEGORIES.find((c) => squash(c) === k) ?? CATEGORY_WORDS[k] ?? 'other';
}

/** A billing cycle as the app spells it ("Yearly", "annual" → "yearly"); unknown or empty → "monthly". */
export function toBillingCycle(raw: string): BillingCycle {
  const k = squash(raw);
  return BILLING_CYCLES.find((c) => squash(c) === k) ?? BILLING_WORDS[k] ?? 'monthly';
}

const pick = <T extends string>(list: T[], raw: string): T | undefined => list.find((v) => v === raw.trim().toLowerCase());

/**
 * Maps CSV rows to structured import objects.
 */
export function parseServicesFromCSV(csvText: string): { valid: ParsedImportRow[]; errors: string[] } {
  const rows = parseCSV(csvText);
  if (rows.length < 2) {
    return { valid: [], errors: ['CSV file must contain a header row and at least one data row.'] };
  }

  const headers = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const valid: ParsedImportRow[] = [];
  const errors: string[] = [];

  const getCol = (row: string[], nameList: string[]): string => {
    for (const name of nameList) {
      const idx = headers.indexOf(name);
      if (idx !== -1 && row[idx] !== undefined) return row[idx];
    }
    return '';
  };

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const productName = getCol(row, ['productname', 'product', 'app']);
    const providerName = getCol(row, ['provider', 'providername', 'service', 'name']);
    const categoryRaw = getCol(row, ['category', 'type']) || 'other';
    const costRaw = getCol(row, ['cost', 'price', 'amount']);
    const currencyRaw = getCol(row, ['currency']) || 'USD';
    const billingCycleRaw = getCol(row, ['billingcycle', 'cycle', 'frequency']) || 'monthly';
    const envRaw = getCol(row, ['environment', 'env']) || 'production';
    const plan = getCol(row, ['plan', 'tier']) || 'Standard';
    const renewalDate = getCol(row, ['renewaldate', 'renewal', 'duedate']);
    const paymentMethodLabel = getCol(row, ['paymentmethod', 'payment', 'card']);
    const accountEmail = getCol(row, ['accountemail', 'email']);
    const notes = getCol(row, ['notes', 'description']);
    const autoRenewRaw = getCol(row, ['autorenew']).toLowerCase();
    const loginUrl = getCol(row, ['loginurl', 'login']);
    const statusRaw = getCol(row, ['status']);
    const appStatusRaw = getCol(row, ['appstatus']);
    const tagsRaw = getCol(row, ['tags', 'apptags']);
    const liveUrl = getCol(row, ['liveurl', 'website', 'siteurl']);
    const repoUrl = getCol(row, ['repourl', 'repo', 'repository']);
    const appDescription = getCol(row, ['appdescription']);

    if (!providerName) {
      errors.push(`Row ${i + 1}: Missing Provider name`);
      continue;
    }

    const cost = parseFloat(costRaw) || 0;
    const currency: Currency = currencyRaw.toUpperCase() === 'ETB' ? 'ETB' : 'USD';
    const env = envRaw.toLowerCase().includes('dev')
      ? 'dev'
      : envRaw.toLowerCase().includes('stag')
      ? 'staging'
      : 'production';

    const tags = [...new Set(tagsRaw.split(/[;|,]/).map((t) => t.trim()).filter(Boolean))];

    valid.push({
      productName: productName || 'General Stack',
      providerName,
      category: toCategory(categoryRaw),
      cost,
      currency,
      billingCycle: toBillingCycle(billingCycleRaw),
      environmentType: env,
      plan,
      renewalDate: renewalDate ? renewalDate.slice(0, 10) : undefined,
      autoRenew: !['no', 'false', '0', 'off'].includes(autoRenewRaw),
      status: pick(SERVICE_STATUSES, statusRaw) ?? 'active',
      paymentMethodLabel: paymentMethodLabel || '',
      accountEmail,
      loginUrl,
      notes,
      appStatus: pick(APP_STATUSES, appStatusRaw),
      appTags: tags.length ? tags : undefined,
      liveUrl: liveUrl || undefined,
      repoUrl: repoUrl || undefined,
      appDescription: appDescription || undefined,
    });
  }

  return { valid, errors };
}
