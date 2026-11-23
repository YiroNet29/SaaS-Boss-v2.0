/**
 * Words and numbers for the Timeline and Portfolio "Cards & payments" pages: each card's charges with what
 * is left after each one, payments grouped by month or by app, and which card or person pays for each app.
 * Pure, so they are easy to test. The money rules themselves live in ledger.ts and monthlySummary.ts.
 */
import type { Payment, PaymentSource, Product, ServiceLink } from '../types';
import { calculateMonthlyCost } from './cost';
import { formatCurrency } from './formatters';
import { convert, type TopUpPlan, type UpcomingCharge } from './ledger';
import { monthName, type MonthlySummary } from './monthlySummary';
import { priceLabel } from './portfolio';
import { toUsd } from './summary';
import { shortDate } from './timeline';

const round2 = (n: number) => Math.round(n * 100) / 100;
const usd = (n: number) => formatCurrency(round2(n), 'USD');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "A", "A and B", "A, B and C". */
export function andList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "Nov 10", or "Nov 10, 2025" when it is not this year. */
export function dayLabel(iso: string, today: string): string {
  return iso.slice(0, 4) === today.slice(0, 4) ? shortDate(iso) : `${shortDate(iso)}, ${iso.slice(0, 4)}`;
}

/** "•••• 4821 · USD · prepaid · expires 08/2027 · 5 services", "person · USD · 2 services". */
export function sourceMeta(s: PaymentSource, serviceCount: number): string {
  return [
    s.last4 && `•••• ${s.last4}`,
    s.kind !== 'card' && s.kind,
    s.currency,
    s.prepaid && 'prepaid',
    s.expiresOn && `expires ${s.expiresOn.slice(5, 7)}/${s.expiresOn.slice(0, 4)}`,
    plural(serviceCount, 'service'),
  ]
    .filter(Boolean)
    .join(' · ');
}

// ---------------------------------------------------------------------------
// Timeline: the next 30 days, charge by charge
// ---------------------------------------------------------------------------

export interface LedgerCharge {
  kind: 'charge';
  charge: UpcomingCharge;
  /** Money left on a prepaid card, or what you'll owe a person, after this charge. Null when the source keeps no balance. */
  after: number | null;
  /** bad: the card goes below zero. warn: below its low-balance mark. */
  tone?: 'warn' | 'bad';
}

export interface LedgerTopUp {
  kind: 'topup';
  needed: number;
  by: string;
  daysLeft: number;
}

export type LedgerLine = LedgerCharge | LedgerTopUp;

/** What the number after each charge means: "left after", "you'll owe", or null (no balance kept). */
export function runningLabel(s: PaymentSource): string | null {
  if (s.kind === 'person') return "you'll owe";
  return s.prepaid ? 'left after' : null;
}

/**
 * A source's charges in date order with the running balance after each one. When a top-up is needed, its
 * row goes right before the charge that would fail.
 */
export function chargeLedger(source: PaymentSource, balance: number, charges: UpcomingCharge[], plan: TopUpPlan): LedgerLine[] {
  const floor = source.lowBalance ?? 0;
  const short = plan.needed > 0 ? plan.firstShortCharge : undefined;
  const out: LedgerLine[] = [];
  let running = balance;
  for (const c of charges) {
    if (short && plan.by && c.serviceId === short.serviceId && c.date === short.date)
      out.push({ kind: 'topup', needed: plan.needed, by: plan.by, daysLeft: plan.daysLeft ?? c.daysDiff });
    if (source.kind === 'person') {
      running += c.amount;
      out.push({ kind: 'charge', charge: c, after: round2(running) });
    } else if (source.prepaid) {
      running -= c.amount;
      const tone = running < 0 ? 'bad' : running < floor ? 'warn' : undefined;
      out.push({ kind: 'charge', charge: c, after: round2(running), ...(tone ? { tone } : {}) });
    } else {
      out.push({ kind: 'charge', charge: c, after: null });
    }
  }
  return out;
}

export interface MoneyTotals {
  /** Everything charged to your cards and people in the next 30 days, in USD. */
  next30Usd: number;
  next30Count: number;
  /** What you owe people, in USD. */
  owedUsd: number;
  owedTo: string[];
  hasPeople: boolean;
}

/** The numbers in the page head. */
export function moneyTotals(views: { source: PaymentSource; balance: number; charges: UpcomingCharge[] }[], etbPerUsd: number): MoneyTotals {
  let next30Usd = 0;
  let next30Count = 0;
  let owedUsd = 0;
  const owedTo: string[] = [];
  for (const v of views) {
    for (const c of v.charges) next30Usd += convert(c.amount, v.source.currency, 'USD', etbPerUsd);
    next30Count += v.charges.length;
    if (v.source.kind === 'person' && v.balance > 0.005) {
      owedUsd += convert(v.balance, v.source.currency, 'USD', etbPerUsd);
      owedTo.push(v.source.name);
    }
  }
  return {
    next30Usd: round2(next30Usd),
    next30Count,
    owedUsd: round2(owedUsd),
    owedTo,
    hasPeople: views.some((v) => v.source.kind === 'person'),
  };
}

/** "Friend", "Abebe and Sara", "3 people". */
export function peopleLine(names: string[]): string {
  return names.length > 2 ? `${names.length} people` : andList(names);
}

/** "Paid Vercel Pro (Oct 7) and Supabase Pro (Oct 12)": the latest payments a card or person made, oldest first. */
export function recentPaid(payments: Payment[], services: ServiceLink[], sourceId: string, count = 2): string {
  const mine = payments
    .filter((p) => p.sourceId === sourceId)
    .sort((a, b) => (a.paidOn < b.paidOn ? 1 : a.paidOn > b.paidOn ? -1 : 0))
    .slice(0, count)
    .reverse();
  if (!mine.length) return '';
  const name = (p: Payment) => services.find((s) => s.id === p.serviceLinkId)?.providerName ?? (p.note?.split(' · ')[0] || 'a payment');
  return `Paid ${andList(mine.map((p) => `${name(p)} (${shortDate(p.paidOn)})`))}`;
}

// ---------------------------------------------------------------------------
// Payments by month (Timeline) and by app (Portfolio)
// ---------------------------------------------------------------------------

export interface MonthGroup {
  month: string;
  payments: Payment[];
}

/** Payments grouped by month, newest month first, newest payment first in each. */
export function groupByMonth(payments: Payment[]): MonthGroup[] {
  const sorted = [...payments].sort((a, b) => (a.paidOn < b.paidOn ? 1 : a.paidOn > b.paidOn ? -1 : 0));
  const map = new Map<string, Payment[]>();
  for (const p of sorted) {
    const m = p.paidOn.slice(0, 7);
    map.set(m, [...(map.get(m) ?? []), p]);
  }
  return [...map.entries()].map(([month, list]) => ({ month, payments: list }));
}

/** "+$2.65 vs October", "−$3.10 vs October", "Same as October", or null when the month before had nothing. */
export function monthChange(totalUsd: number, previousUsd: number, previousMonth: string): string | null {
  if (!previousUsd) return null;
  const prev = monthName(previousMonth).split(' ')[0];
  const diff = round2(totalUsd - previousUsd);
  if (diff === 0) return `Same as ${prev}`;
  return `${diff > 0 ? '+' : '−'}${usd(Math.abs(diff))} vs ${prev}`;
}

/**
 * "ETB 11,984 · 5 payments · +$2.65 vs October" (≈ when part of the birr is estimated). A month still in
 * progress isn't compared with a full one (same rule as the Classic monthly summary).
 */
export function monthLine(
  s: Pick<MonthlySummary, 'totalUsd' | 'totalEtb' | 'etbEstimated' | 'count' | 'previousUsd' | 'previousMonth'>,
  opts: { inProgress?: boolean } = {}
): string {
  const change = opts.inProgress ? null : monthChange(s.totalUsd, s.previousUsd, s.previousMonth);
  return [`${s.etbEstimated ? '≈ ' : ''}${formatCurrency(s.totalEtb, 'ETB')}`, plural(s.count, 'payment'), change].filter(Boolean).join(' · ');
}

/** "Virtual card $70.85 · Friend $3.20" for a list of summary rows. */
export const rowsLine = (rows: { name: string; usd: number }[]) => rows.map((r) => `${r.name} ${usd(r.usd)}`).join(' · ');

export interface AppPayments {
  key: string;
  name: string;
  usd: number;
  payments: Payment[];
}

/**
 * A month's payments grouped by app (the same names the monthly summary uses), the app that cost most first.
 * Newest payment first in each.
 */
export function paymentsByApp(
  payments: Payment[],
  services: ServiceLink[],
  products: Pick<Product, 'id' | 'name'>[],
  month: string,
  etbPerUsd: number
): AppPayments[] {
  const service = new Map(services.map((s) => [s.id, s]));
  const product = new Map(products.map((p) => [p.id, p.name]));
  const groups = new Map<string, AppPayments>();
  const inMonth = payments.filter((p) => p.paidOn.slice(0, 7) === month).sort((a, b) => (a.paidOn < b.paidOn ? 1 : a.paidOn > b.paidOn ? -1 : 0));
  for (const p of inMonth) {
    const svc = p.serviceLinkId ? service.get(p.serviceLinkId) : undefined;
    const key = svc ? svc.productId : '';
    const name = svc ? (product.get(svc.productId) ?? 'No product') : 'Not linked to a service';
    const g = groups.get(key) ?? { key, name, usd: 0, payments: [] };
    g.usd += convert(p.amount, p.currency, 'USD', etbPerUsd);
    g.payments.push(p);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, usd: round2(g.usd) })).sort((a, b) => b.usd - a.usd || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Portfolio: each app, by who pays
// ---------------------------------------------------------------------------

/** The key of the "Not set" column: paid services without a card or person. */
export const NOT_SET = '';

export interface PayerColumn {
  key: string;
  name: string;
  source?: PaymentSource;
}

export interface PayerCell {
  /** A month, in USD. */
  usd: number;
  services: ServiceLink[];
}

export interface PayerRow {
  product: Product;
  cells: PayerCell[];
  usd: number;
}

export interface PayerMatrix {
  columns: PayerColumn[];
  rows: PayerRow[];
  columnUsd: number[];
  usd: number;
}

/**
 * What each app costs a month, split by the card or person that pays (the same monthly cost the
 * dashboard counts: yearly plans / 12, usage-based at their usual price, cancelled ones left out).
 * Every card and person gets a column; a "Not set" column is added when a paid service has none.
 */
export function payerMatrix(products: Product[], services: ServiceLink[], sources: PaymentSource[], etbPerUsd: number): PayerMatrix {
  const live = sources.filter((s) => !s.archived);
  const known = new Set(live.map((s) => s.id));
  const monthly = (s: ServiceLink) => toUsd(calculateMonthlyCost(s.cost, s.billingCycle), s.currency, etbPerUsd);
  const paid = services.filter((s) => s.status !== 'cancelled' && monthly(s) > 0);
  const keyOf = (s: ServiceLink) => (s.paymentSourceId && known.has(s.paymentSourceId) ? s.paymentSourceId : NOT_SET);

  const columns: PayerColumn[] = live.map((s) => ({ key: s.id, name: s.name, source: s }));
  if (paid.some((s) => keyOf(s) === NOT_SET)) columns.push({ key: NOT_SET, name: 'Not set' });

  const raw = products.map((product) => {
    const own = paid.filter((s) => s.productId === product.id);
    const cells = columns.map((col) => {
      const these = own.filter((s) => keyOf(s) === col.key).sort((a, b) => a.providerName.localeCompare(b.providerName));
      return { usd: these.reduce((sum, s) => sum + monthly(s), 0), services: these };
    });
    return { product, cells, usd: cells.reduce((sum, c) => sum + c.usd, 0) };
  });
  const columnUsd = columns.map((_, i) => round2(raw.reduce((sum, r) => sum + r.cells[i].usd, 0)));
  const total = raw.reduce((sum, r) => sum + r.usd, 0);
  const rows = raw
    .map((r) => ({ ...r, usd: round2(r.usd), cells: r.cells.map((c) => ({ ...c, usd: round2(c.usd) })) }))
    .sort((a, b) => b.usd - a.usd || a.product.name.localeCompare(b.product.name));
  return { columns, rows, columnUsd, usd: round2(total) };
}

/** "Claude API, saasboss.io ($12.98/yr)": monthly plans by name, others with their price. */
export function cellServices(list: ServiceLink[]): string {
  return list.map((s) => (s.billingCycle === 'monthly' ? s.providerName : `${s.providerName} (${priceLabel(s)})`)).join(', ');
}
