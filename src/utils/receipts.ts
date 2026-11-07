/**
 * Receipts: tidying what was read from a receipt, a plain-text reader for forwarded emails,
 * matching a receipt to a service and card, and deciding what confirming it does to the payment
 * history. Pure (no network) and unit-tested; the app and the Telegram bot share it.
 */
import type { Currency, Payment, PaymentSource, ReceiptDetails, ServiceLink } from '../types';
import { renewalPaymentId } from './ledger';
import { advanceAfterPayment } from './renewals';
import { formatCurrency } from './formatters';

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

/** File types the receipts bucket accepts, and the extension each is stored under. */
export const RECEIPT_FILE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
};

/** Best guess at a file's type when the sender didn't say (Telegram documents sometimes don't). */
export function receiptMimeType(mime: string | undefined, fileName?: string): string | null {
  const m = (mime || '').toLowerCase();
  if (m === 'image/jpg') return 'image/jpeg';
  if (RECEIPT_FILE_TYPES[m]) return m;
  const ext = (fileName || '').toLowerCase().split('.').pop();
  const byExt: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', pdf: 'application/pdf', txt: 'text/plain' };
  return (ext && byExt[ext]) || null;
}

export const isSavableCurrency = (c: string | undefined): c is Currency => c === 'USD' || c === 'ETB';

// ---------------------------------------------------------------------------
// Cleaning
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const CURRENCY_WORDS: [RegExp, string][] = [
  [/^(us\$|\$|usd|us dollars?|dollars?)$/i, 'USD'],
  [/^(etb|br\.?|birr)$/i, 'ETB'],
  [/^(€|eur|euros?)$/i, 'EUR'],
  [/^(£|gbp|pounds?)$/i, 'GBP'],
];

/** "$" / "US$" / "usd" → USD, "Br" / "birr" → ETB, "€" → EUR. Unknown 3-letter codes pass through. */
export function normalizeCurrency(raw: string): string | undefined {
  const s = raw.trim();
  for (const [re, code] of CURRENCY_WORDS) if (re.test(s)) return code;
  return /^[A-Za-z]{3}$/.test(s) ? s.toUpperCase() : undefined;
}

/** "1,234.56" → 1234.56, "1.234,56" → 1234.56, "20" → 20. */
export function parseAmount(raw: string): number {
  let s = raw.replace(/[^0-9.,]/g, '');
  if (!s) return NaN;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Whichever comes last is the decimal mark.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // "20,00" is a decimal comma; "1,250" is a thousands separator.
    s = /,\d{2}$/.test(s) && s.split(',').length === 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  return Number(s);
}

/** Makes whatever was read (Claude's JSON, a form, old rows) safe to show and use. */
export function cleanDetails(raw: unknown): ReceiptDetails {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, n: number) =>
    typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, n) : undefined;
  const out: ReceiptDetails = {};

  if (typeof r.isReceipt === 'boolean') out.isReceipt = r.isReceipt;
  const vendor = str(r.vendor, 80);
  if (vendor) out.vendor = vendor;

  const amount = typeof r.amount === 'number' ? r.amount : typeof r.amount === 'string' ? parseAmount(r.amount) : NaN;
  if (Number.isFinite(amount) && amount > 0 && amount < 100_000_000) out.amount = Math.round(amount * 100) / 100;

  const currency = typeof r.currency === 'string' ? normalizeCurrency(r.currency) : undefined;
  if (currency) out.currency = currency;

  for (const k of ['date', 'periodStart', 'periodEnd'] as const) if (isIsoDate(r[k])) out[k] = r[k] as string;

  const last4 = typeof r.cardLast4 === 'string' || typeof r.cardLast4 === 'number' ? String(r.cardLast4).replace(/\D/g, '') : '';
  if (/^\d{4}$/.test(last4)) out.cardLast4 = last4;

  const invoice = str(r.invoiceNumber, 60);
  if (invoice) out.invoiceNumber = invoice;
  const summary = str(r.summary, 200);
  if (summary) out.summary = summary;
  if (r.readBy === 'claude' || r.readBy === 'text' || r.readBy === 'manual') out.readBy = r.readBy;
  for (const k of ['suggestedServiceId', 'suggestedSourceId'] as const) {
    const v = str(r[k], 80);
    if (v) out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Plain-text reader (forwarded emails, pasted text) — used when Claude isn't set up
// ---------------------------------------------------------------------------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const CUR = String.raw`US\$|\$|USD|ETB|Br\.?|birr|€|EUR|£|GBP`;
const NUM = String.raw`\d[\d.,]*\d|\d`;
const MONEY_BEFORE = new RegExp(String.raw`(${CUR})\s?(${NUM})`, 'gi');
const MONEY_AFTER = new RegExp(String.raw`(${NUM})\s?(USD|ETB|birr|Br\b|EUR|GBP)`, 'gi');

function amountsIn(line: string): { amount: number; currency?: string }[] {
  const out: { amount: number; currency?: string }[] = [];
  for (const m of line.matchAll(MONEY_BEFORE)) out.push({ amount: parseAmount(m[2]), currency: normalizeCurrency(m[1]) });
  for (const m of line.matchAll(MONEY_AFTER)) out.push({ amount: parseAmount(m[1]), currency: normalizeCurrency(m[2]) });
  return out.filter((x) => Number.isFinite(x.amount) && x.amount > 0);
}

function datesIn(line: string): string[] {
  const out: string[] = [];
  const pad = (n: number) => String(n).padStart(2, '0');
  for (const m of line.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) out.push(`${m[1]}-${m[2]}-${m[3]}`);
  // "Nov 5, 2026" / "November 5 2026"
  for (const m of line.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/g)) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0) out.push(`${m[3]}-${pad(mi + 1)}-${pad(Number(m[2]))}`);
  }
  // "5 Nov 2026" / "5 November, 2026"
  for (const m of line.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(20\d{2})\b/g)) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) out.push(`${m[3]}-${pad(mi + 1)}-${pad(Number(m[1]))}`);
  }
  return out.filter(isIsoDate);
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const GENERIC_MAIL = /^(gmail|googlemail|yahoo|outlook|hotmail|icloud|proton|protonmail|mail|email|stripe|paddle)$/i;

/** Pulls amount, currency, date, card and vendor out of a forwarded receipt email. Best effort. */
export function parseReceiptText(text: string): ReceiptDetails {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ReceiptDetails = { readBy: 'text' };

  // Amount: prefer a "total / amount paid / charged" line (the last one wins), else the largest amount.
  const totalLine = /\b(total|amount\s+(paid|charged|due)|charged|you\s+paid|payment\s+of)\b/i;
  const preferred = lines.filter((l) => totalLine.test(l) && !/sub-?total/i.test(l)).flatMap(amountsIn);
  const all = lines.flatMap(amountsIn);
  const pick = preferred.length ? preferred[preferred.length - 1] : all.sort((a, b) => b.amount - a.amount)[0];
  if (pick) {
    out.amount = Math.round(pick.amount * 100) / 100;
    if (pick.currency) out.currency = pick.currency;
  }

  // Date: prefer a "date / paid / charged / issued" line, else the first date anywhere.
  const dateLine = /\b(date|paid|charged|issued|billed)\b/i;
  const date = lines.filter((l) => dateLine.test(l)).flatMap(datesIn)[0] ?? lines.flatMap(datesIn)[0];
  if (date) out.date = date;

  const card = /(?:ending(?:\s+in)?|ends\s+(?:in|with)|last\s+4(?:\s+digits)?:?|[•*xX]{3,}[\s-]?)\s*(\d{4})\b/i.exec(text);
  if (card) out.cardLast4 = card[1];

  // Vendor: the "From:" name of a forwarded email, else the sender's domain, else "receipt from X".
  const from = /^from:\s*"?([^"<\n]+?)"?\s*<([^>]+)>/im.exec(text) || /^from:\s*([^\s<]+@[^\s>]+)/im.exec(text);
  if (from) {
    const name = from[2] ? from[1].trim() : '';
    const domain = (from[2] || from[1]).split('@')[1]?.split('.').slice(-2, -1)[0];
    const cleaned = name.replace(/\b(billing|receipts?|invoices?|payments?|team|support|no-?reply)\b/gi, '').replace(/\s+/g, ' ').trim();
    if (cleaned && !/@/.test(cleaned)) out.vendor = cleaned;
    else if (domain && !GENERIC_MAIL.test(domain)) out.vendor = titleCase(domain);
  }
  if (!out.vendor) {
    const m = /\b(?:[Rr]eceipt|[Ii]nvoice|[Pp]ayment)\s+(?:from|to)\s+([A-Z][\w.&' -]{1,40}?)(?:[.,:!\n]|\s+for\b|$)/m.exec(text);
    if (m) out.vendor = m[1].trim();
  }
  out.isReceipt = Boolean(out.amount);
  return out;
}

/** Whether a plain Telegram message is probably a receipt (forwarded, or long with an amount in it). */
export function looksLikeReceiptText(text: string, forwarded: boolean): boolean {
  if (text.trim().startsWith('/')) return false;
  if (forwarded) return true;
  return text.trim().length >= 30 && (amountsIn(text).length > 0 || /\b(receipt|invoice|charged|payment)\b/i.test(text));
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'inc', 'llc', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company', 'pbc', 'gmbh', 'plc', 'sa', 'bv',
  'technologies', 'technology', 'labs', 'software', 'services', 'service', 'hq', 'the', 'com', 'io', 'app',
  'dev', 'net', 'org', 'billing', 'payments', 'payment', 'receipt', 'invoice', 'subscription', 'www',
]);
const ALIASES: Record<string, string> = { amazonweb: 'aws', googlecloud: 'gcp', googlecloudplatform: 'gcp', digitalocean: 'do' };

function vendorKey(s: string): string {
  const joined = s
    .toLowerCase()
    .replace(/https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
    .join('');
  return ALIASES[joined] ?? joined;
}

/** 0 (different) … 1 (same name). "Vercel Inc." vs "Vercel" = 1; "Supabase Pro" vs "Supabase" = 0.85. */
export function vendorScore(vendor: string, provider: string): number {
  const a = vendorKey(vendor);
  const b = vendorKey(provider);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 3 && long.includes(short)) return 0.85;
  return 0;
}

export interface ReceiptMatch {
  serviceId?: string;
  sourceId?: string;
  score: number;
}

/** The service a receipt most likely pays for, and the card or person that paid. */
export function suggestMatch(d: ReceiptDetails, services: ServiceLink[], sources: PaymentSource[]): ReceiptMatch {
  const byCard = d.cardLast4 ? sources.find((s) => !s.archived && s.last4 === d.cardLast4) : undefined;
  let best: { svc: ServiceLink; score: number } | undefined;
  for (const svc of services) {
    let score = d.vendor ? vendorScore(d.vendor, svc.providerName) : 0;
    if (score === 0) continue;
    if (d.amount && svc.cost && d.currency === svc.currency) {
      const diff = Math.abs(d.amount - svc.cost) / svc.cost;
      score += diff < 0.01 ? 0.3 : diff <= 0.25 ? 0.15 : 0; // tax and fees make it a little higher
    }
    if (byCard && svc.paymentSourceId === byCard.id) score += 0.2;
    if (svc.status === 'cancelled') score -= 0.3;
    if (!best || score > best.score) best = { svc, score };
  }
  const svc = best && best.score >= 0.5 ? best.svc : undefined;
  return { serviceId: svc?.id, sourceId: byCard?.id ?? svc?.paymentSourceId, score: Math.round((best?.score ?? 0) * 100) / 100 };
}

// ---------------------------------------------------------------------------
// What confirming does
// ---------------------------------------------------------------------------

export type ReceiptPlan =
  /** A payment for this charge is already recorded (auto-renewal, "Paid" button): attach the receipt to it. */
  | { kind: 'attach'; paymentId: string; paidOn: string }
  /** The receipt pays the service's current renewal: record it and move the renewal date on. */
  | { kind: 'renewal'; paymentId: string; due: string; next: string }
  /** Anything else: a new payment (one id per receipt, so confirming twice can't double it). */
  | { kind: 'new'; paymentId: string };

const daysApart = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
export const receiptPaymentId = (receiptId: string) => `pay-${receiptId}`.slice(0, 80);

export function planReceiptPayment(opts: {
  receiptId: string;
  date: string;
  service?: ServiceLink;
  payments: Payment[];
  today: string;
}): ReceiptPlan {
  const { receiptId, date, service, payments, today } = opts;
  if (service) {
    const near = payments
      .filter(
        (p) =>
          p.serviceLinkId === service.id &&
          (!p.receiptId || p.receiptId === receiptId) &&
          Math.abs(daysApart(p.paidOn, date)) <= 10
      )
      .sort((a, b) => Math.abs(daysApart(a.paidOn, date)) - Math.abs(daysApart(b.paidOn, date)))[0];
    if (near) return { kind: 'attach', paymentId: near.id, paidOn: near.paidOn };

    if (service.renewalDate && Math.abs(daysApart(service.renewalDate, date)) <= 10) {
      const id = renewalPaymentId(service.id, service.renewalDate);
      const taken = payments.some((p) => p.id === id && p.receiptId && p.receiptId !== receiptId);
      const anchor = service.startDate ? Number(service.startDate.slice(8, 10)) : undefined;
      const next = advanceAfterPayment(service.renewalDate, service.billingCycle, today, anchor);
      if (next && !taken) return { kind: 'renewal', paymentId: id, due: service.renewalDate, next };
    }
  }
  return { kind: 'new', paymentId: receiptPaymentId(receiptId) };
}

/** One line saying what Confirm / Save will do. */
export function describePlan(plan: ReceiptPlan, serviceName?: string): string {
  if (plan.kind === 'attach') return `Adds this receipt to the ${serviceName ?? ''} payment on ${plan.paidOn}`.replace('  ', ' ');
  if (plan.kind === 'renewal') return `Marks the ${serviceName} renewal due ${plan.due} paid · next renewal ${plan.next}`;
  return serviceName ? `Records a new ${serviceName} payment` : 'Records a new payment (not linked to a service)';
}

/** "Vercel · $20 · 2026-11-05" — whatever is known. */
export function receiptHeadline(d: ReceiptDetails): string {
  const amount =
    d.amount === undefined ? '' : isSavableCurrency(d.currency) ? formatCurrency(d.amount, d.currency) : `${d.currency ?? ''} ${d.amount}`.trim();
  return [d.vendor || 'Unknown vendor', amount, d.date].filter(Boolean).join(' · ');
}
