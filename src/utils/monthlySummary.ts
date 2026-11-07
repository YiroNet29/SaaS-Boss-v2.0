/**
 * Monthly spending summary: what last month cost (USD and birr), by product, by card or person, the
 * biggest services, payments still missing a receipt, and what's due next. Pure; the Telegram
 * message on the 1st, the /month bot command and the Cards & Payments page all use it.
 */
import type { Payment, PaymentSource, Product, ServiceLink } from '../types';
import { convert, endOfMonth } from './ledger';
import { formatCurrency } from './formatters';
import { escapeHtml } from './telegramUi';

export interface SummaryRow {
  name: string;
  usd: number;
  count: number;
}

export interface MonthlySummary {
  month: string; // YYYY-MM
  count: number;
  totalUsd: number;
  /** Birr actually paid where recorded, estimated at the current rate otherwise. */
  totalEtb: number;
  etbEstimated: boolean;
  previousMonth: string;
  previousUsd: number;
  byProduct: SummaryRow[];
  bySource: SummaryRow[];
  topServices: SummaryRow[];
  withoutReceipt: number;
  /** Renewals due in the month after (for the message sent on the 1st). */
  upcoming: { month: string; count: number; usd: number };
}

export interface MonthlyInput {
  payments: Payment[];
  services: ServiceLink[];
  products: Pick<Product, 'id' | 'name'>[];
  sources: PaymentSource[];
  etbPerUsd: number;
}

export const isMonth = (m: unknown): m is string => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

export const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const cents = (n: number) => Math.round(n * 100) / 100;

function group(rows: { key: string; usd: number }[]): SummaryRow[] {
  const map = new Map<string, SummaryRow>();
  for (const r of rows) {
    const g = map.get(r.key) ?? { name: r.key, usd: 0, count: 0 };
    g.usd += r.usd;
    g.count++;
    map.set(r.key, g);
  }
  return [...map.values()].map((g) => ({ ...g, usd: cents(g.usd) })).sort((a, b) => b.usd - a.usd || a.name.localeCompare(b.name));
}

export function summarizeMonth(input: MonthlyInput, month: string): MonthlySummary {
  const { payments, services, products, sources, etbPerUsd: rate } = input;
  const service = new Map(services.map((s) => [s.id, s]));
  const product = new Map(products.map((p) => [p.id, p.name]));
  const source = new Map(sources.map((s) => [s.id, s.name]));
  const inMonth = (m: string) => payments.filter((p) => p.paidOn.slice(0, 7) === m);

  const these = inMonth(month);
  const usdOf = (p: Payment) => convert(p.amount, p.currency, 'USD', rate);
  const rows = these.map((p) => {
    const svc = p.serviceLinkId ? service.get(p.serviceLinkId) : undefined;
    return {
      p,
      usd: usdOf(p),
      productName: svc ? product.get(svc.productId) ?? 'No product' : 'Not linked to a service',
      sourceName: p.sourceId ? source.get(p.sourceId) ?? 'Removed card' : 'Not set',
      serviceName: svc?.providerName ?? (p.note?.split(' · ')[0] || 'Other'),
    };
  });

  let etbEstimated = false;
  const totalEtb = these.reduce((sum, p) => {
    if (p.currency === 'ETB') return sum + p.amount;
    if (p.etbPaid) return sum + p.etbPaid;
    etbEstimated = true;
    return sum + convert(p.amount, p.currency, 'ETB', rate);
  }, 0);

  const next = shiftMonth(month, 1);
  const due = services.filter(
    (s) =>
      s.status !== 'cancelled' &&
      s.cost > 0 &&
      s.billingCycle !== 'free' &&
      s.billingCycle !== 'one-time' &&
      !!s.renewalDate &&
      s.renewalDate >= `${next}-01` &&
      s.renewalDate <= endOfMonth(next)
  );

  return {
    month,
    count: these.length,
    totalUsd: cents(rows.reduce((s, r) => s + r.usd, 0)),
    totalEtb: Math.round(totalEtb),
    etbEstimated,
    previousMonth: shiftMonth(month, -1),
    previousUsd: cents(inMonth(shiftMonth(month, -1)).reduce((s, p) => s + usdOf(p), 0)),
    byProduct: group(rows.map((r) => ({ key: r.productName, usd: r.usd }))),
    bySource: group(rows.map((r) => ({ key: r.sourceName, usd: r.usd }))),
    topServices: group(rows.map((r) => ({ key: r.serviceName, usd: r.usd }))).slice(0, 5),
    withoutReceipt: these.filter((p) => !p.receiptId).length,
    upcoming: { month: next, count: due.length, usd: cents(due.reduce((s, x) => s + convert(x.cost, x.currency, 'USD', rate), 0)) },
  };
}

const usd = (n: number) => formatCurrency(n, 'USD');

/** "▲ 12% vs September ($189.60)" — or nothing when there's no earlier month to compare. */
export function changeLine(s: MonthlySummary): string | null {
  if (!s.previousUsd) return null;
  const pct = Math.round(((s.totalUsd - s.previousUsd) / s.previousUsd) * 100);
  const prev = monthName(s.previousMonth).split(' ')[0];
  if (pct === 0) return `Same as ${prev} (${usd(s.previousUsd)})`;
  return `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs ${prev} (${usd(s.previousUsd)})`;
}

/** The message: Telegram HTML, and the same as plain lines for email. */
export function buildMonthlyMessage(s: MonthlySummary, workspaceName: string, opts: { includeUpcoming?: boolean } = {}) {
  const blocks: { title?: string; lines: string[] }[] = [];
  const etb = `${s.etbEstimated ? '≈ ' : ''}${formatCurrency(s.totalEtb, 'ETB')}`;
  const head = s.count
    ? [`Spent ${usd(s.totalUsd)} (${etb}) on ${s.count} payment${s.count === 1 ? '' : 's'}`]
    : ['No payments recorded.'];
  const change = changeLine(s);
  if (change) head.push(change);
  blocks.push({ lines: head });
  if (s.count) {
    const list = (rows: SummaryRow[]) => rows.map((r) => `• ${r.name}: ${usd(r.usd)}`);
    if (s.byProduct.length > 1 || s.byProduct[0]?.name !== 'Not linked to a service') blocks.push({ title: 'By product', lines: list(s.byProduct) });
    blocks.push({ title: 'Paid with', lines: list(s.bySource) });
    blocks.push({ title: 'Biggest', lines: s.topServices.map((r, i) => `${i + 1}. ${r.name} ${usd(r.usd)}`) });
  }
  const notes: string[] = [];
  if (s.withoutReceipt) notes.push(`🧾 ${s.withoutReceipt} payment${s.withoutReceipt === 1 ? ' has' : 's have'} no receipt yet.`);
  if (opts.includeUpcoming && s.upcoming.count) {
    const m = monthName(s.upcoming.month).split(' ')[0];
    notes.push(`📅 Coming up in ${m}: ${s.upcoming.count} renewal${s.upcoming.count === 1 ? '' : 's'}, about ${usd(s.upcoming.usd)}.`);
  }
  if (notes.length) blocks.push({ lines: notes });

  const title = `${monthName(s.month)} · ${workspaceName}`;
  const html =
    `📊 <b>${escapeHtml(title)}</b>\n\n` +
    blocks
      .map((b) => (b.title ? `<b>${escapeHtml(b.title)}</b>\n` : '') + b.lines.map(escapeHtml).join('\n'))
      .join('\n\n');
  const plain = blocks.flatMap((b) => (b.title ? [`${b.title}:`, ...b.lines] : b.lines));
  return { title, html, plain };
}
