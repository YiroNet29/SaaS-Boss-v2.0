/**
 * Filters, totals, orderings and words for the Apps list and one app's page. The Classic pages use the
 * filter and totals; the Timeline and Portfolio pages use the rest. Pure, so they are easy to test.
 */
import type { ImportantDate, Payment, PaymentSource, Product, ProductStatus, ServiceCategory, ServiceLink } from '../types';
import { getDaysDiff } from './reminders';
import { formatCurrency, formatDaysDiff } from './formatters';
import { categoryLabel, serviceLine, type ServiceTone } from './portfolio';
import { shortDate, type DueRow } from './timeline';
import { calculateMonthlyCost } from './cost';
import { canMarkPaid } from './serviceViews';

export { canMarkPaid };

export const APP_STATUSES: ProductStatus[] = ['live', 'building', 'idea', 'paused', 'retired'];
export type AppStatusFilter = 'all' | ProductStatus;

/** The Apps list's search (name, description or a tag) and status filter. */
export function matchesApp(p: Product, search: string, status: string): boolean {
  const q = search.toLowerCase();
  const matchesSearch =
    p.name.toLowerCase().includes(q) ||
    (p.description || '').toLowerCase().includes(q) ||
    !!p.tags?.some((t) => t.toLowerCase().includes(q));
  return matchesSearch && (status === 'all' || p.status === status);
}

/** An app's tags, trimmed, lower-cased and without blanks or repeats. */
const tagKeys = (p: Pick<Product, 'tags'>): string[] => [
  ...new Set((p.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean)),
];

/**
 * The Apps list's tag filter: 'all', 'none' (apps without a tag) or '#' plus a tag (any case, so
 * '#yg' also matches an app tagged 'YG').
 */
export function matchesTag(p: Pick<Product, 'tags'>, filter: string): boolean {
  if (!filter || filter === 'all') return true;
  const tags = tagKeys(p);
  if (filter === 'none') return tags.length === 0;
  return tags.includes(filter.slice(1).toLowerCase());
}

export interface TagOption {
  value: string;
  label: string;
  count: number;
}

/**
 * The tag filter's choices: every app, then each tag in use (most apps first, then by name) and,
 * when some apps have no tag, those. Empty when no app has a tag, so the filter can stay hidden.
 */
export function tagOptions(products: Pick<Product, 'tags'>[]): TagOption[] {
  const byKey = new Map<string, { label: string; count: number }>();
  let untagged = 0;
  for (const p of products) {
    const keys = tagKeys(p);
    if (!keys.length) untagged += 1;
    for (const k of keys) {
      const hit = byKey.get(k);
      if (hit) hit.count += 1;
      // Shown as first written (an app tagged 'YG' before one tagged 'yg' shows '#YG').
      else byKey.set(k, { label: (p.tags ?? []).find((t) => t.trim().toLowerCase() === k)!.trim(), count: 1 });
    }
  }
  if (!byKey.size) return [];
  const tags = [...byKey.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label))
    .map(([k, t]) => ({ value: `#${k}`, label: `#${t.label} (${t.count})`, count: t.count }));
  return [
    { value: 'all', label: `All tags (${products.length})`, count: products.length },
    ...tags,
    ...(untagged ? [{ value: 'none', label: `No tag (${untagged})`, count: untagged }] : []),
  ];
}

/** How many apps have each status (and how many there are in all). */
export function statusCounts(products: Pick<Product, 'status'>[]): Record<AppStatusFilter, number> {
  const out: Record<AppStatusFilter, number> = { all: products.length, live: 0, building: 0, idea: 0, paused: 0, retired: 0 };
  for (const p of products) if (p.status in out) out[p.status] += 1;
  return out;
}

export const statusLabel = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Pill colour for an app's status. */
export function statusTone(s: ProductStatus): 'ok' | 'warn' | 'date' | 'none' | 'bad' {
  if (s === 'live') return 'ok';
  if (s === 'building') return 'warn';
  if (s === 'idea') return 'date';
  if (s === 'retired') return 'bad';
  return 'none';
}

export interface AppTotals {
  /** Its services, cancelled left out. */
  services: ServiceLink[];
  /** Its dates that are not done. */
  openDates: ImportantDate[];
  monthlyUsd: number;
  monthlyEtb: number;
}

/** An app's services, open dates and monthly cost (yearly counts as a twelfth; usage, one-time and free count as 0). */
export function appTotals(productId: string, services: ServiceLink[], dates: ImportantDate[], etbPerUsd: number): AppTotals {
  const own = services.filter((s) => s.productId === productId && s.status !== 'cancelled');
  const openDates = dates.filter((d) => d.productId === productId && d.status !== 'done');
  let monthlyUsd = 0;
  for (const s of own) {
    // Same rule as the workspace total, so the apps add up to it (usage-based at its listed price).
    const base = calculateMonthlyCost(s.cost, s.billingCycle);
    monthlyUsd += s.currency === 'ETB' ? base / etbPerUsd : base;
  }
  return { services: own, openDates, monthlyUsd, monthlyEtb: monthlyUsd * etbPerUsd };
}

/** Apps with something due soonest first (overdue first of all); apps with nothing due last, by name. */
export function sortByNextDue<T extends { id: string; name: string }>(apps: T[], rows: { productId?: string; daysDiff: number }[]): T[] {
  const soonest = new Map<string, number>();
  for (const r of rows) {
    if (!r.productId) continue;
    const was = soonest.get(r.productId);
    if (was === undefined || r.daysDiff < was) soonest.set(r.productId, r.daysDiff);
  }
  return [...apps].sort((a, b) => {
    const da = soonest.get(a.id);
    const db = soonest.get(b.id);
    if (da !== undefined && db !== undefined && da !== db) return da - db;
    if (da === undefined && db !== undefined) return 1;
    if (db === undefined && da !== undefined) return -1;
    return a.name.localeCompare(b.name);
  });
}

/** The first renewal to pay among an app's due rows (an overdue one first). */
export function nextCharge(rows: DueRow[]): DueRow | undefined {
  return rows.filter((r) => r.kind === 'renewal').sort((a, b) => a.daysDiff - b.daysDiff)[0];
}

/** "Claude API · Dec 1 · ≈ $15" (≈ when the price changes with use). */
export function chargeText(r: DueRow): string {
  const amount = r.usd === undefined ? '' : ` · ${r.tone === 'usage' ? '≈ ' : ''}${formatCurrency(Math.round(r.usd * 100) / 100, 'USD')}`;
  return `${r.name} · ${shortDate(r.dueDate)}${amount}`;
}

/** "1 overdue: Hetzner invoice", "3 overdue", or '' when nothing is. */
export function overdueText(rows: Pick<DueRow, 'name' | 'daysDiff'>[]): string {
  const late = rows.filter((r) => r.daysDiff < 0);
  if (!late.length) return '';
  return late.length === 1 ? `1 overdue: ${late[0].name}` : `${late.length} overdue`;
}

/** Pill colour for a service's status (active needs no pill). */
export function serviceStatusTone(s: ServiceLink['status']): 'ok' | 'warn' | 'none' | 'bad' {
  if (s === 'trial') return 'warn';
  if (s === 'paused') return 'none';
  if (s === 'cancelled') return 'bad';
  return 'ok';
}


/** Who pays for a service: its card or person, else the label typed on it. */
export function paidWithName(s: ServiceLink, sources: Pick<PaymentSource, 'id' | 'name'>[]): string {
  return sources.find((x) => x.id === s.paymentSourceId)?.name || s.paymentMethodLabel;
}

/** Every card or person that pays for these services, once each. */
export function paidWithNames(services: ServiceLink[], sources: Pick<PaymentSource, 'id' | 'name'>[]): string[] {
  const names: string[] = [];
  for (const s of services) {
    const n = paidWithName(s, sources)?.trim();
    if (n && !names.includes(n)) names.push(n);
  }
  return names;
}

/** Services grouped by category, in the order each category first appears. */
export function groupByCategory(services: ServiceLink[]): [ServiceCategory, ServiceLink[]][] {
  const map = new Map<ServiceCategory, ServiceLink[]>();
  for (const s of services) {
    if (!map.has(s.category)) map.set(s.category, []);
    map.get(s.category)!.push(s);
  }
  return Array.from(map.entries());
}

/** "4 · Hosting, Domain, Database" (the categories, once each). */
export function servicesSummary(services: ServiceLink[]): string {
  if (!services.length) return 'None yet';
  const names = groupByCategory(services).map(([c]) => categoryLabel(c));
  return `${services.length} · ${names.join(', ')}`;
}

/** "Pro · renews by itself · production": plan, how it is paid, and where it runs. */
export function planText(s: ServiceLink, today: string): string {
  const how = serviceLine(s, today).kind.split(' · ').slice(1).join(' · ');
  return [s.plan, how, s.environmentType].filter(Boolean).join(' · ');
}

/** The pill for a service: how it renews, or that its date has passed. */
export function servicePill(s: ServiceLink, today: string): { tone: ServiceTone; label: string } {
  const line = serviceLine(s, today);
  if (line.tone === 'overdue') return { tone: 'overdue', label: 'Overdue' };
  if (line.tone === 'free') return { tone: 'free', label: 'Free plan' };
  if (line.tone === 'none') return { tone: 'none', label: 'No date' };
  if (s.status === 'trial' && s.trialEndsAt) return { tone: 'manual', label: 'Trial ends' };
  if (line.tone === 'usage') return { tone: 'usage', label: 'Usage-based' };
  return line.tone === 'auto' ? { tone: 'auto', label: 'Auto-renews' } : { tone: 'manual', label: 'Renew by hand' };
}

/** "Also used by Addis Bites (Hobby)" when another app pays the same provider; '' when none does. */
export function sharedProviderNote(service: ServiceLink, services: ServiceLink[], products: Pick<Product, 'id' | 'name'>[]): string {
  // Same matching as the Services page's provider view (calculateProviderConcentration): trimmed, exact.
  const name = service.providerName.trim();
  if (!name) return '';
  const others = services.filter(
    (s) => s.id !== service.id && s.productId !== service.productId && s.status !== 'cancelled' && s.providerName.trim() === name
  );
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const s of others) {
    const app = products.find((p) => p.id === s.productId);
    if (!app || seen.has(app.id)) continue;
    seen.add(app.id);
    parts.push(s.plan ? `${app.name} (${s.plan})` : app.name);
  }
  return parts.length ? `Also used by ${parts.join(', ')}` : '';
}

/** The day a date sits on: its snooze, else its due date. */
export const effectiveDate = (d: Pick<ImportantDate, 'snoozedUntil' | 'dueDate'>) => d.snoozedUntil || d.dueDate;

/** "recurs yearly", "every 45 days", "once". */
export function recurrenceText(d: Pick<ImportantDate, 'recurrence' | 'customRecurrenceDays'>): string {
  if (d.recurrence === 'none') return 'once';
  if (d.recurrence === 'custom days') return d.customRecurrenceDays ? `every ${d.customRecurrenceDays} days` : 'repeats';
  return `recurs ${d.recurrence}`;
}

/** "recurs yearly · checked automatically" (and when it was due, if snoozed). */
export function dateFacts(d: ImportantDate): string {
  const parts = [recurrenceText(d)];
  if (d.status === 'snoozed' && d.snoozedUntil) parts.push(`snoozed, was due ${shortDate(d.dueDate)}`);
  if (d.autoCheck && d.checkTarget) parts.push('checked automatically');
  return parts.join(' · ');
}

/** "In 41 days · recurs yearly · checked automatically". */
export function dateDetail(d: ImportantDate, today: string): string {
  const when = d.status === 'done' ? 'Done' : formatDaysDiff(getDaysDiff(today, effectiveDate(d))).label;
  return `${when} · ${dateFacts(d)}`;
}

/** "Domain expiry" for 'domain expiry', "SSL expiry" stays as it is. */
export const dateTypeLabel = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : 'Date');

/** "Dec 1", with the year when it is more than about ten months away ("Nov 20, 2027"). */
export function dayLabel(date: string, daysDiff: number): string {
  return Math.abs(daysDiff) > 300 ? `${shortDate(date)}, ${date.slice(0, 4)}` : shortDate(date);
}

export interface OpenDates {
  count: number;
  overdue: number;
  /** The next date that has not passed. */
  next?: { title: string; date: string };
}

/** An app's dates that are not done: how many, how many are overdue, and which is next. */
export function openDatesSummary(dates: ImportantDate[], today: string): OpenDates {
  const open = dates.filter((d) => d.status !== 'done');
  let overdue = 0;
  let next: OpenDates['next'];
  for (const d of open) {
    const day = effectiveDate(d);
    if (getDaysDiff(today, day) < 0) overdue += 1;
    else if (!next || day < next.date) next = { title: d.title, date: day };
  }
  return { count: open.length, overdue, next };
}

export interface AgendaItem {
  id: string;
  kind: 'service' | 'date';
  /** The day it sits on: renewal or trial end, or the date's due day (snooze included). */
  date: string;
  daysDiff: number;
  service?: ServiceLink;
  item?: ImportantDate;
}

export interface Agenda {
  /** Services and dates with a day, soonest first. */
  dated: AgendaItem[];
  /** Free services and services with no date. */
  undated: ServiceLink[];
  cancelled: ServiceLink[];
  /** Dates already done, latest first. */
  done: ImportantDate[];
}

/** One app's services and dates in one list by day, plus what has no day. */
export function appAgenda(services: ServiceLink[], dates: ImportantDate[], today: string): Agenda {
  const dated: AgendaItem[] = [];
  const undated: ServiceLink[] = [];
  const cancelled: ServiceLink[] = [];
  for (const s of services) {
    if (s.status === 'cancelled') {
      cancelled.push(s);
      continue;
    }
    const day = s.billingCycle === 'free' ? undefined : s.status === 'trial' && s.trialEndsAt ? s.trialEndsAt : s.renewalDate;
    if (!day) undated.push(s);
    else dated.push({ id: s.id, kind: 'service', date: day.slice(0, 10), daysDiff: getDaysDiff(today, day), service: s });
  }
  const done: ImportantDate[] = [];
  for (const d of dates) {
    if (d.status === 'done') {
      done.push(d);
      continue;
    }
    const day = effectiveDate(d);
    dated.push({ id: d.id, kind: 'date', date: day.slice(0, 10), daysDiff: getDaysDiff(today, day), item: d });
  }
  const name = (i: AgendaItem) => i.service?.providerName ?? i.item?.title ?? '';
  dated.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === 'service' ? -1 : 1) || name(a).localeCompare(name(b)));
  undated.sort((a, b) => a.providerName.localeCompare(b.providerName));
  done.sort((a, b) => (b.completedAt || b.dueDate).localeCompare(a.completedAt || a.dueDate));
  return { dated, undated, cancelled, done };
}

/** The latest payments for these services, newest first. */
export function appPayments(payments: Payment[], serviceIds: Set<string>, limit = 6): Payment[] {
  return payments
    .filter((p) => p.serviceLinkId && serviceIds.has(p.serviceLinkId))
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
