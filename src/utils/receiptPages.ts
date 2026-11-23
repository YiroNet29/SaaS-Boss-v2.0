/**
 * Grouping for the Timeline and Portfolio Receipts pages: done receipts by month or by app, and this
 * month's payments that still have no receipt. Pure functions, unit-tested.
 */
import type { Payment, Product, Receipt, ServiceLink } from '../types';
import { shortDate } from './timeline';

type Dated = Pick<Receipt, 'createdAt'>;

/** "2026-11": the month a receipt came in (the date the Classic list shows). */
export const receiptMonth = (r: Dated) => r.createdAt.slice(0, 7);

/** "November 2026" for "2026-11". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Newest first, by when it came in. */
export const newestFirst = <T extends Dated>(list: T[]): T[] => [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** Months that have receipts, newest first. */
export function receiptMonths(list: Dated[]): string[] {
  return [...new Set(list.map(receiptMonth))].sort((a, b) => b.localeCompare(a));
}

/** "6 receipts · all saved", "3 receipts · 2 saved, 1 ignored". */
export function monthSummary(saved: number, ignored: number): string {
  const total = saved + ignored;
  const count = `${total} ${total === 1 ? 'receipt' : 'receipts'}`;
  if (total === 0) return 'No receipts';
  if (ignored === 0) return `${count} · ${total === 1 ? 'saved' : 'all saved'}`;
  if (saved === 0) return `${count} · ${total === 1 ? 'ignored' : 'all ignored'}`;
  return `${count} · ${saved} saved, ${ignored} ignored`;
}

export interface MonthGroup<T> {
  month: string;
  label: string;
  receipts: T[];
  summary: string;
}

/** Done receipts in one group per month, newest month first and newest first inside each. */
export function doneByMonth<T extends Pick<Receipt, 'createdAt' | 'status'>>(done: T[]): MonthGroup<T>[] {
  const byMonth = new Map<string, T[]>();
  for (const r of newestFirst(done)) {
    const m = receiptMonth(r);
    byMonth.set(m, [...(byMonth.get(m) ?? []), r]);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, receipts]) => {
      const saved = receipts.filter((r) => r.status === 'confirmed').length;
      return { month, label: monthLabel(month), receipts, summary: monthSummary(saved, receipts.length - saved) };
    });
}

/** Receipts saved (confirmed) that came in during the month. */
export function savedInMonth(receipts: Pick<Receipt, 'createdAt' | 'status'>[], month: string): number {
  return receipts.filter((r) => r.status === 'confirmed' && receiptMonth(r) === month).length;
}

/** Payments made in the month that have no receipt attached. */
export function paymentsWithoutReceipt<T extends Pick<Payment, 'paidOn' | 'receiptId'>>(payments: T[], month: string): T[] {
  return payments.filter((p) => p.paidOn?.startsWith(month) && !p.receiptId);
}

/**
 * Per app: one line for each payment this month that has no receipt yet ("Supabase Pro, Nov 12: no receipt
 * yet"), or says a receipt for that service is already waiting for review.
 */
export function missingReceiptsByApp(
  payments: Pick<Payment, 'paidOn' | 'receiptId' | 'serviceLinkId'>[],
  services: Pick<ServiceLink, 'id' | 'productId' | 'providerName'>[],
  toReview: Pick<Receipt, 'serviceLinkId' | 'extracted'>[],
  month: string
): Map<string, string[]> {
  const svc = new Map(services.map((s) => [s.id, s]));
  const waiting = new Set(toReview.map((r) => r.extracted?.suggestedServiceId ?? r.serviceLinkId).filter(Boolean));
  const out = new Map<string, string[]>();
  const list = paymentsWithoutReceipt(payments, month).sort((a, b) => a.paidOn.localeCompare(b.paidOn));
  for (const p of list) {
    const s = p.serviceLinkId ? svc.get(p.serviceLinkId) : undefined;
    if (!s?.productId) continue;
    const line = `${s.providerName}, ${shortDate(p.paidOn)}: ${waiting.has(s.id) ? 'receipt waiting for review above' : 'no receipt yet'}`;
    out.set(s.productId, [...(out.get(s.productId) ?? []), line]);
  }
  return out;
}

export interface AppColumn<T> {
  /** null: receipts not linked to an app. */
  productId: string | null;
  name: string;
  receipts: T[];
  /** Payments this month with no receipt (see missingReceiptsByApp). */
  missing: string[];
}

/**
 * Done receipts in one column per app (by the linked service's app), in the apps' own order, then a
 * "Not linked to an app" column. `month` is "2026-11" or "all". Apps show up when they have receipts in
 * that month or a payment with no receipt.
 */
export function doneByApp<T extends Pick<Receipt, 'createdAt' | 'serviceLinkId'>>(
  done: T[],
  services: Pick<ServiceLink, 'id' | 'productId'>[],
  products: Pick<Product, 'id' | 'name'>[],
  month: string,
  missing: Map<string, string[]> = new Map()
): AppColumn<T>[] {
  const appOf = new Map(services.map((s) => [s.id, s.productId]));
  const known = new Set(products.map((p) => p.id));
  const inMonth = newestFirst(done).filter((r) => month === 'all' || receiptMonth(r) === month);
  const byApp = new Map<string | null, T[]>();
  for (const r of inMonth) {
    const app = r.serviceLinkId ? appOf.get(r.serviceLinkId) : undefined;
    const key = app && known.has(app) ? app : null;
    byApp.set(key, [...(byApp.get(key) ?? []), r]);
  }
  const cols: AppColumn<T>[] = products
    .filter((p) => byApp.has(p.id) || (missing.get(p.id)?.length ?? 0) > 0)
    .map((p) => ({ productId: p.id, name: p.name, receipts: byApp.get(p.id) ?? [], missing: missing.get(p.id) ?? [] }));
  if (byApp.has(null)) cols.push({ productId: null, name: 'Not linked to an app', receipts: byApp.get(null)!, missing: [] });
  return cols;
}
