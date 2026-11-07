import { Product, ServiceLink, Workspace, ImportantDate, Currency, ServiceCategory, BillingCycle, ServiceStatus } from '../types';

/**
 * Escapes a single CSV cell string.
 */
function escapeCSV(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
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
      ? Math.round((monthlyBase / (exchangeRate || 130)) * 100) / 100
      : Math.round(monthlyBase * 100) / 100;

  const monthlyEtb =
    currency === 'ETB'
      ? Math.round(monthlyBase * 100) / 100
      : Math.round(monthlyBase * (exchangeRate || 130) * 100) / 100;

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
        row.push(entry.trim());
        entry = '';
      } else {
        entry += char;
      }
    }
    row.push(entry.trim());
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
  status: ServiceStatus;
  paymentMethodLabel: string;
  accountEmail: string;
  notes: string;
}

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

    valid.push({
      productName: productName || 'General Stack',
      providerName,
      category: (categoryRaw.toLowerCase() as ServiceCategory) || 'other',
      cost,
      currency,
      billingCycle: (billingCycleRaw.toLowerCase() as BillingCycle) || 'monthly',
      environmentType: env,
      plan,
      renewalDate: renewalDate ? renewalDate.slice(0, 10) : undefined,
      status: 'active',
      paymentMethodLabel: paymentMethodLabel || '',
      accountEmail,
      notes,
    });
  }

  return { valid, errors };
}
