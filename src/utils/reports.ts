import type { Payment, PaymentSource, Product, Receipt, ServiceLink } from '../types';
import { escapeCSV } from './csv';

export const ORIGIN_LABEL: Record<Payment['origin'], string> = {
  auto_renew: 'Auto-renewal',
  manual: 'Marked paid',
  telegram: 'Telegram',
  receipt: 'Receipt',
};

const toUsd = (p: Pick<Payment, 'amount' | 'currency'>, etbPerUsd: number) => (p.currency === 'ETB' ? p.amount / etbPerUsd : p.amount);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** What was actually paid for these services in the 12 months up to `today` (YYYY-MM-DD). */
export function paidInLastYear(
  payments: Payment[],
  serviceIds: Set<string>,
  etbPerUsd: number,
  today: string
): { usd: number; etb: number; count: number } {
  const from = new Date(`${today}T00:00:00Z`);
  from.setUTCFullYear(from.getUTCFullYear() - 1);
  const since = from.toISOString().slice(0, 10);
  const mine = payments.filter((p) => p.serviceLinkId && serviceIds.has(p.serviceLinkId) && p.paidOn > since && p.paidOn <= today);
  const usd = mine.reduce((sum, p) => sum + toUsd(p, etbPerUsd), 0);
  const etb = mine.reduce((sum, p) => sum + (p.etbPaid ?? (p.currency === 'ETB' ? p.amount : p.amount * etbPerUsd)), 0);
  return { usd: round2(usd), etb: Math.round(etb), count: mine.length };
}

/** One month's payments as a spreadsheet (CSV), oldest first, for records or taxes. `month` is YYYY-MM. */
export function monthPaymentsCsv(opts: {
  month: string;
  payments: Payment[];
  services: ServiceLink[];
  products: Product[];
  sources: PaymentSource[];
  receipts: Receipt[];
}): { csv: string; count: number } {
  const { month, payments, services, products, sources, receipts } = opts;
  const svc = new Map(services.map((s) => [s.id, s]));
  const prod = new Map(products.map((p) => [p.id, p.name]));
  const src = new Map(sources.map((s) => [s.id, s.name]));
  const rcpt = new Map(receipts.map((r) => [r.id, r]));
  const rows = payments.filter((p) => p.paidOn.startsWith(`${month}-`)).sort((a, b) => a.paidOn.localeCompare(b.paidOn));
  const header = ['Date', 'Service', 'App', 'Paid with', 'Amount', 'Currency', 'Cost in birr', 'How', 'Receipt', 'Note'];
  const lines = rows.map((p) => {
    const s = p.serviceLinkId ? svc.get(p.serviceLinkId) : undefined;
    const r = p.receiptId ? rcpt.get(p.receiptId) : receipts.find((x) => x.paymentId === p.id);
    const receipt = r ? r.extracted?.vendor || r.originalName || 'yes' : '';
    return [
      p.paidOn,
      s?.providerName ?? '',
      s ? prod.get(s.productId) ?? '' : '',
      p.sourceId ? src.get(p.sourceId) ?? '' : '',
      p.amount.toFixed(2),
      p.currency,
      p.etbPaid !== undefined ? String(p.etbPaid) : '',
      ORIGIN_LABEL[p.origin] ?? p.origin,
      receipt,
      p.note,
    ]
      .map(escapeCSV)
      .join(',');
  });
  return { csv: [header.join(','), ...lines].join('\n') + '\n', count: rows.length };
}
