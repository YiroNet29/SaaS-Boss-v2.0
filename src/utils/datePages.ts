/**
 * Filters, grouping and labels for the Dates page: the filter all three layouts use, the month blocks of
 * the Timeline layout and the app columns of the Portfolio layout. Pure, so they are easy to test.
 */
import type { ImportantDate, ImportantDateType, PaymentSource, Product, ProductStatus, ServiceLink } from '../types';
import { formatDate, formatDaysDiff } from './formatters';
import { getDaysDiff } from './reminders';
import { isCheckable } from './expiryChecks';
import { priceLabel } from './portfolio';
import { shortDate } from './timeline';

export const DATE_TYPES: ImportantDateType[] = [
  'domain expiry',
  'SSL expiry',
  'invoice due',
  'key rotation',
  'free trial end',
  'contract renewal',
  'custom',
];

/** "Domain expiry", "SSL expiry". */
export const typeLabel = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/** The day a date is due now: the snoozed-to day when it is snoozed. */
export const effectiveDay = (d: Pick<ImportantDate, 'dueDate' | 'snoozedUntil'>) => d.snoozedUntil || d.dueDate;

export interface DateFilters {
  search: string;
  /** "open" (active and snoozed), "all", or one status. */
  status: string;
  /** "all" or one type. */
  type: string;
  /** "all" or an app id. */
  productId: string;
}

/** The Dates list's filter: search (title, app, notes), status, type and app. */
export function filterDates(dates: ImportantDate[], appNames: Map<string, string>, f: DateFilters): ImportantDate[] {
  const q = f.search.toLowerCase();
  return dates.filter((d) => {
    const pName = d.productId ? appNames.get(d.productId) || '' : 'Global';
    const matchesSearch =
      d.title.toLowerCase().includes(q) || pName.toLowerCase().includes(q) || d.notes?.toLowerCase().includes(q);
    const matchesStatus =
      f.status === 'all' ? true : f.status === 'open' ? d.status === 'open' || d.status === 'snoozed' : d.status === f.status;
    const matchesType = f.type === 'all' || d.type === f.type;
    const matchesProduct = f.productId === 'all' || d.productId === f.productId;
    return matchesSearch && matchesStatus && matchesType && matchesProduct;
  });
}

export type DateTone = 'bad' | 'warn' | 'date' | 'ok';

/** Colour of a date's dot and type pill. Same rule as the Classic list's dot; done dates are green. */
export function dateTone(status: ImportantDate['status'], daysDiff: number): DateTone {
  if (status === 'done') return 'ok';
  const { urgency } = formatDaysDiff(daysDiff);
  return urgency === 'overdue' ? 'bad' : urgency === 'urgent' ? 'warn' : 'date';
}

/** "Due Nov 20, 2026", plus "· snoozed to Dec 1, 2026" when snoozed. */
export function dueText(d: Pick<ImportantDate, 'dueDate' | 'snoozedUntil'>): string {
  return `Due ${formatDate(d.dueDate)}${d.snoozedUntil ? ` · snoozed to ${formatDate(d.snoozedUntil)}` : ''}`;
}

/** "Recurs yearly", "Recurs every 45 days", or null when it doesn't repeat. */
export function recurrenceText(d: Pick<ImportantDate, 'recurrence' | 'customRecurrenceDays'>): string | null {
  if (d.recurrence === 'none') return null;
  if (d.recurrence === 'custom days' && d.customRecurrenceDays) return `Recurs every ${d.customRecurrenceDays} days`;
  return `Recurs ${d.recurrence}`;
}

/** One row on the Timeline: a date, or a service renewal shown lighter. */
export interface DateEntry {
  key: string;
  kind: 'date' | 'renewal';
  /** YYYY-MM-DD it sits on. */
  day: string;
  daysDiff: number;
  title: string;
  date?: ImportantDate;
  service?: ServiceLink;
}

export function dateEntry(d: ImportantDate, today: string): DateEntry {
  const day = effectiveDay(d).slice(0, 10);
  return { key: `date-${d.id}`, kind: 'date', day, daysDiff: getDaysDiff(today, day), title: d.title, date: d };
}

/**
 * Service renewals to show among the dates, the way the Calendar shows them (not cancelled, with a renewal
 * date). None when the filters ask for done dates or one type of date; search and the app filter apply.
 */
export function renewalEntries(services: ServiceLink[], appNames: Map<string, string>, f: DateFilters, today: string): DateEntry[] {
  if (f.status === 'done' || f.type !== 'all') return [];
  const q = f.search.toLowerCase();
  return services
    .filter((s) => s.status !== 'cancelled' && !!s.renewalDate)
    .filter((s) => f.productId === 'all' || s.productId === f.productId)
    .map((s): DateEntry => {
      const day = s.renewalDate!.slice(0, 10);
      return { key: `renewal-${s.id}`, kind: 'renewal', day, daysDiff: getDaysDiff(today, day), title: `${s.providerName} renewal`, service: s };
    })
    .filter(
      (e) =>
        !q ||
        e.title.toLowerCase().includes(q) ||
        (appNames.get(e.service!.productId) || '').toLowerCase().includes(q) ||
        e.service!.notes?.toLowerCase().includes(q)
    );
}

export interface TimelineBlock {
  key: string;
  /** "Overdue" or "December 2026". */
  label: string;
  overdue: boolean;
  entries: DateEntry[];
}

const isOverdue = (e: DateEntry) => e.daysDiff < 0 && e.date?.status !== 'done';

const byDay = (a: DateEntry, b: DateEntry) =>
  a.day.localeCompare(b.day) || (a.kind === b.kind ? 0 : a.kind === 'date' ? -1 : 1) || a.title.localeCompare(b.title);

/** "December 2026" for 2026-12. */
export function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Overdue first (oldest on top), then one block per month, soonest first. */
export function timelineBlocks(entries: DateEntry[]): TimelineBlock[] {
  const sorted = [...entries].sort(byDay);
  const overdue = sorted.filter(isOverdue);
  const blocks: TimelineBlock[] = overdue.length ? [{ key: 'overdue', label: 'Overdue', overdue: true, entries: overdue }] : [];
  for (const e of sorted) {
    if (isOverdue(e)) continue;
    const key = e.day.slice(0, 7);
    const last = blocks[blocks.length - 1];
    if (last && last.key === key) last.entries.push(e);
    else blocks.push({ key, label: monthLabel(key), overdue: false, entries: [e] });
  }
  return blocks;
}

/**
 * The day number and the small line under it on the Timeline: "Tue", or "Nov · Fri" in the Overdue block
 * (with the year when it isn't this year's).
 */
export function dayParts(day: string, withMonth: boolean, today: string): { num: string; sub: string } {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  if (!withMonth) return { num: String(d), sub: weekday };
  const month = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const year = String(y) === today.slice(0, 4) ? '' : ` ${y}`;
  return { num: String(d), sub: `${month}${year} · ${weekday}` };
}

/** "Dec 20", or "Jan 3, 2027" when it isn't this year. */
export function dayLabel(day: string, today: string): string {
  return day.slice(0, 4) === today.slice(0, 4) ? shortDate(day) : `${shortDate(day)}, ${day.slice(0, 4)}`;
}

export type RenewalTone = 'auto' | 'usage' | 'manual' | 'free';

export interface RenewalInfo {
  /** Pill colour, and the dot's when it isn't overdue. */
  tone: RenewalTone;
  /** "Auto-renews", "Usage-based", "Renew by hand", "Free plan". */
  label: string;
  /** "$20/mo · Virtual card ·· 4821" */
  sub: string;
  dot: 'auto' | 'usage' | 'manual' | 'bad';
}

/** How a renewal on the Timeline is paid, with its price and the card or person paying. */
export function renewalInfo(s: ServiceLink, sources: PaymentSource[], daysDiff: number): RenewalInfo {
  const tone: RenewalTone =
    s.billingCycle === 'free' ? 'free' : s.billingCycle === 'usage-based' ? 'usage' : s.autoRenew ? 'auto' : 'manual';
  const label = { free: 'Free plan', usage: 'Usage-based', auto: 'Auto-renews', manual: 'Renew by hand' }[tone];
  const source = s.paymentSourceId ? sources.find((p) => p.id === s.paymentSourceId) : undefined;
  const payer = source ? (source.last4 ? `${source.name} ·· ${source.last4}` : source.name) : s.paymentMethodLabel;
  return {
    tone,
    label,
    sub: [priceLabel(s), payer].filter(Boolean).join(' · '),
    dot: daysDiff < 0 ? 'bad' : tone === 'free' ? 'auto' : tone,
  };
}

/** One column on the Portfolio page: an app's dates, or the workspace's dates without an app. */
export interface DateColumn {
  key: string;
  /** Undefined for the "Whole workspace" column. */
  product?: Product;
  dates: ImportantDate[];
  open: number;
  done: number;
}

/** Overdue on top, then by the day each is due, then by title. */
export function sortColumnDates(dates: ImportantDate[], today: string): ImportantDate[] {
  const overdue = (d: ImportantDate) => d.status !== 'done' && getDaysDiff(today, effectiveDay(d)) < 0;
  return [...dates].sort(
    (a, b) =>
      Number(overdue(b)) - Number(overdue(a)) ||
      effectiveDay(a).localeCompare(effectiveDay(b)) ||
      a.title.localeCompare(b.title)
  );
}

/**
 * A column per app (in `order`, then the rest as listed), then "Whole workspace" for dates without an app
 * (or whose app was deleted). Empty columns only when `showEmpty`.
 */
export function dateColumns(
  dates: ImportantDate[],
  products: Product[],
  today: string,
  { order = [], showEmpty = false }: { order?: string[]; showEmpty?: boolean } = {}
): DateColumn[] {
  const known = new Set(products.map((p) => p.id));
  const byKey = new Map<string, ImportantDate[]>();
  for (const d of dates) {
    const key = d.productId && known.has(d.productId) ? d.productId : 'workspace';
    byKey.set(key, [...(byKey.get(key) ?? []), d]);
  }
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length : i;
  };
  const sortedProducts = products
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p.id) - rank(b.p.id) || a.i - b.i)
    .map(({ p }) => p);

  const column = (key: string, product?: Product): DateColumn => {
    const own = sortColumnDates(byKey.get(key) ?? [], today);
    const done = own.filter((d) => d.status === 'done').length;
    return { key, product, dates: own, open: own.length - done, done };
  };
  const cols = [...sortedProducts.map((p) => column(p.id, p)), column('workspace')];
  return cols.filter((c) => showEmpty || c.dates.length > 0);
}

/** "2 open", "2 open · 1 done", or "" for an empty column. */
export function columnCount(c: Pick<DateColumn, 'open' | 'done'>): string {
  if (!c.open && !c.done) return '';
  return c.done ? `${c.open} open · ${c.done} done` : `${c.open} open`;
}

/** What an empty column says, given the status filter. */
export function columnEmptyText(status: string): string {
  return status === 'open' ? 'No open dates.' : status === 'done' ? 'No completed dates.' : 'No dates yet.';
}

/** Pill colour for an app's status in a column heading. */
export function appStatusTone(status: ProductStatus): 'ok' | 'warn' | 'date' | 'none' {
  return status === 'live' ? 'ok' : status === 'building' ? 'warn' : status === 'idea' ? 'date' : 'none';
}

export interface DateStats {
  overdue: number;
  /** Open dates due in the next 30 days (today included). */
  next30: number;
  /** Service renewals in the next 30 days. */
  renewals30: number;
  /** Open domain / SSL dates that are checked automatically. */
  autoChecked: number;
}

/** The numbers in the Dates page head. Done dates are left out. */
export function dateStats(dates: ImportantDate[], services: ServiceLink[], today: string): DateStats {
  const open = dates.filter((d) => d.status !== 'done');
  const diffs = open.map((d) => getDaysDiff(today, effectiveDay(d)));
  return {
    overdue: diffs.filter((n) => n < 0).length,
    next30: diffs.filter((n) => n >= 0 && n <= 30).length,
    renewals30: services.filter((s) => {
      if (s.status === 'cancelled' || !s.renewalDate) return false;
      const n = getDaysDiff(today, s.renewalDate);
      return n >= 0 && n <= 30;
    }).length,
    autoChecked: open.filter((d) => isCheckable(d) && !!d.checkTarget && !!d.autoCheck).length,
  };
}

/** "1 date", "3 dates". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
