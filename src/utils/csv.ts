import { Product, ServiceLink, Currency, ServiceCategory, BillingCycle, ServiceStatus, ProductStatus } from '../types';
import { FALLBACK_ETB_PER_USD } from './fx';
import { formatDate } from './formatters';

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

/** Drops the apostrophe escapeCSV puts in front of formula-like text, so an export imports back as it was. */
const unguard = (cell: string) => (/^'[=+\-@\t\r]/.test(cell) ? cell.slice(1) : cell);

/**
 * The separator a spreadsheet used, read from the first line: a comma, or a semicolon (Excel in countries
 * that write 1,5 for one and a half) or a tab (copied from a sheet) when those clearly outnumber commas.
 */
function sniffSeparator(text: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  let cellStart = true;
  // Quotes count the same way parseCSV reads them: only one at the start of a cell opens a quoted cell.
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') i++;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '\n' || ch === '\r') break;
    if (ch === '"' && cellStart) quoted = true;
    else if (ch in counts) {
      counts[ch] += 1;
      cellStart = true;
      continue;
    }
    if (ch !== ' ') cellStart = false;
  }
  if (counts[';'] > counts[','] && counts[';'] >= counts['\t']) return ';';
  if (counts['\t'] > counts[',']) return '\t';
  return ',';
}

/**
 * Splits CSV text into rows of trimmed cells. Handles quoted cells (with commas, "" quotes and line
 * breaks inside), Windows line endings, the invisible mark Excel puts at the start of a "CSV UTF-8" file,
 * and semicolon- or tab-separated files. Rows with nothing in them are left out.
 */
export function parseCSV(csvText: string): string[][] {
  return parseCSVRows(csvText).map((r) => r.cells);
}

/** parseCSV, with the spreadsheet row (file line) each row starts on, so messages name the row Excel shows. */
function parseCSVRows(csvText: string): { cells: string[]; line: number }[] {
  const text = csvText.replace(/^﻿/, '');
  const sep = sniffSeparator(text);
  const rows: { cells: string[]; line: number }[] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const endCell = () => {
    row.push(unguard(cell.trim()));
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.length > 0)) rows.push({ cells: row, line: rowLine });
    row = [];
    rowLine = line;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      // A line break inside a cell is kept as one "\n" (Excel's Alt+Enter), not Windows' "\r\n".
      if (ch === '\r' && text[i + 1] === '\n') continue;
      if (ch === '\n') line++;
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"' && cell.trim() === '') quoted = true;
    // A quote inside a cell that didn't start with one (24" screen) is just a character.
    else if (ch === sep) endCell();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      line++;
      endRow();
    } else cell += ch;
  }
  if (cell.length > 0 || row.length > 0) endRow();
  return rows;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad2 = (n: number) => String(n).padStart(2, '0');

/** "2026-12-15" when the day exists (no 31 June), else undefined. Two-digit years are 20xx. */
function isoDate(y: number, m: number, d: number): string | undefined {
  if (y < 100) y += 2000;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return undefined;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

const monthNumber = (name: string) => {
  const i = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
  return i === -1 ? undefined : i + 1;
};

/** Whether this browser writes dates day first (15/12/2026) rather than month first (12/15/2026). */
export function localeDayFirst(): boolean {
  try {
    const types = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'numeric', year: 'numeric' })
      .formatToParts(new Date(Date.UTC(2026, 11, 25)))
      .map((p) => p.type);
    return types.indexOf('day') < types.indexOf('month');
  } catch {
    return true;
  }
}

/** Day/month/year written with numbers only ("12/15/2026", "15.12.26"): the two leading numbers, if so. */
const numericDate = (raw: string) => {
  const m = raw.trim().replace(/\s+\d{1,2}:\d{2}.*$/, '').match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/);
  return m ? { a: Number(m[1]), b: Number(m[2]), y: Number(m[3]) } : undefined;
};

/**
 * A date as a spreadsheet may write it, as "YYYY-MM-DD": 2026-12-15 (with or without a time), 2026/12/15,
 * 15/12/2026 or 12/15/2026, 15-Dec-26, 15 December 2026, Dec 15, 2026, or Excel's day number (46371).
 * For numbers-only dates, a first number over 12 means day first and a second over 12 means month first;
 * otherwise `dayFirst` decides. Undefined when it can't be read.
 */
export function parseDateCell(raw: string, dayFirst: boolean): string | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])/);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  const n = numericDate(s);
  if (n) {
    const dayFirstHere = n.a > 12 ? true : n.b > 12 ? false : dayFirst;
    return dayFirstHere ? isoDate(n.y, n.b, n.a) : isoDate(n.y, n.a, n.b);
  }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]+([a-z]{3,9})\.?,?[\s\-/.]+(\d{2}|\d{4})$/i);
  if (m) {
    const month = monthNumber(m[2]);
    return month ? isoDate(Number(m[3]), month, Number(m[1])) : undefined;
  }
  m = s.match(/^([a-z]{3,9})\.?[\s\-/.]+(\d{1,2})(?:st|nd|rd|th)?,?[\s\-/.]+(\d{2}|\d{4})$/i);
  if (m) {
    const month = monthNumber(m[1]);
    return month ? isoDate(Number(m[3]), month, Number(m[2])) : undefined;
  }
  // Excel's own day count (days since 30 Dec 1899), when a date cell was saved as a plain number.
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const days = Math.floor(Number(s));
    if (days > 20000 && days < 80000) {
      const t = new Date(Date.UTC(1899, 11, 30) + days * 86400000);
      return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    }
  }
  return undefined;
}

/**
 * A price as a spreadsheet may write it: "20", "$20.00", "1,200", "1,200.50", "1.200,50", "12,5",
 * "ETB 2,600". Undefined when there's no number in it.
 */
export function parseCost(raw: string): number | undefined {
  // Excel's accounting format writes zero as "$ -".
  if (raw.replace(/\s|[$€£]|usd|etb|birr|br/gi, '') === '-') return 0;
  let s = raw.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return undefined;
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  if (comma > -1 && dot > -1) {
    // Whichever comes last is the decimal mark.
    s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (comma > -1) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
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

export interface ParsedImport {
  valid: ParsedImportRow[];
  /** Rows left out, and why. */
  errors: string[];
  /** Rows imported, but with something read as a guess or left empty (a date or price it couldn't read). */
  warnings: string[];
}

const RENEWAL_COLUMNS = ['renewaldate', 'renewal', 'duedate'];

/**
 * Maps CSV rows to structured import objects. Dates written with numbers only (03/04/2027) are read day
 * first or month first: by the file's own clear dates (a 15 in front means day first), else by `dayFirst`
 * (default: how this browser writes dates).
 */
export function parseServicesFromCSV(csvText: string, opts: { dayFirst?: boolean } = {}): ParsedImport {
  const parsedRows = parseCSVRows(csvText);
  const rows = parsedRows.map((r) => r.cells);
  if (rows.length < 2) {
    return { valid: [], errors: ['CSV file must contain a header row and at least one data row.'], warnings: [] };
  }

  const headers = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const valid: ParsedImportRow[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const getCol = (row: string[], nameList: string[]): string => {
    for (const name of nameList) {
      const idx = headers.indexOf(name);
      if (idx !== -1 && row[idx] !== undefined) return row[idx];
    }
    return '';
  };

  // Day or month first, for the whole file: its own clear dates decide, else the browser's habit.
  const numeric = rows
    .slice(1)
    .map((r) => numericDate(getCol(r, RENEWAL_COLUMNS)))
    .filter((n): n is NonNullable<typeof n> => !!n);
  const fileSays = numeric.some((n) => n.a > 12) ? true : numeric.some((n) => n.b > 12) ? false : undefined;
  const dayFirst = fileSays ?? opts.dayFirst ?? localeDayFirst();
  // Only worth a warning when nothing in the file showed the order.
  const unclear = fileSays === undefined ? numeric.find((n) => n.a !== n.b) : undefined;
  if (unclear) {
    const read = isoDate(unclear.y, dayFirst ? unclear.b : unclear.a, dayFirst ? unclear.a : unclear.b);
    if (read) {
      const shown = `${pad2(unclear.a)}/${pad2(unclear.b)}/${unclear.y}`;
      warnings.push(
        `Dates like ${shown} could be day or month first; they were read ${dayFirst ? 'day' : 'month'} first (${formatDate(read)}). ` +
          'If that is wrong, write the dates as year-month-day (2027-04-03) and import again.'
      );
    }
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // The row number Excel shows (blank rows and line breaks inside cells counted).
    const rowNo = parsedRows[i].line;
    const productName = getCol(row, ['productname', 'product', 'app']);
    const providerName = getCol(row, ['provider', 'providername', 'service', 'name']);
    const categoryRaw = getCol(row, ['category', 'type']) || 'other';
    const costRaw = getCol(row, ['cost', 'price', 'amount']);
    const currencyRaw = getCol(row, ['currency']);
    const billingCycleRaw = getCol(row, ['billingcycle', 'cycle', 'frequency']) || 'monthly';
    const envRaw = getCol(row, ['environment', 'env']) || 'production';
    const plan = getCol(row, ['plan', 'tier']) || 'Standard';
    const renewalRaw = getCol(row, RENEWAL_COLUMNS);
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
      errors.push(`Row ${rowNo}${productName ? ` (${productName})` : ''}: no Provider name.`);
      continue;
    }

    const where = `Row ${rowNo} (${providerName})`;
    const readCost = parseCost(costRaw);
    if (costRaw && readCost === undefined) warnings.push(`${where}: couldn't read the cost "${costRaw}", so it is 0.`);
    const cost = readCost ?? 0;

    const renewalDate = renewalRaw ? parseDateCell(renewalRaw, dayFirst) : undefined;
    if (renewalRaw && !renewalDate) warnings.push(`${where}: couldn't read the renewal date "${renewalRaw}", so it is left empty.`);

    // Birr written in the Cost cell ("ETB 2,600", "2600 Br") counts when the Currency cell is empty;
    // another currency there (€5, EUR 5) is reported like one in the Currency cell.
    const otherInCost = costRaw.match(/[€£¥]|\b(eur|gbp|cad|aud|jpy|cny|kes)\b/i)?.[0];
    const currencyWord = (currencyRaw || (/(etb|birr|\bbr\b)/i.test(costRaw) ? 'ETB' : otherInCost || 'USD')).trim().toLowerCase();
    const isEtb = ['etb', 'birr', 'br', 'br.'].includes(currencyWord);
    if (!isEtb && !['usd', '$', 'us$', 'dollar', 'dollars'].includes(currencyWord)) {
      warnings.push(`${where}: StackTrack keeps prices in USD or ETB, so "${currencyRaw || otherInCost}" was read as USD.`);
    }
    const currency: Currency = isEtb ? 'ETB' : 'USD';
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
      renewalDate,
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

  return { valid, errors, warnings };
}
