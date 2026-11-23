/**
 * Groupings and words for the Services page in the Timeline and Portfolio layouts: services by when they
 * renew, by app or by provider, and the short labels on each row. Pure, so they are easy to test.
 */
import type { Product, ProductStatus, ServiceLink } from '../types';
import { formatCurrency } from './formatters';
import { getDaysDiff } from './reminders';
import { relativeDays } from './summary';
import { dateRange, monthlyCostByApp, shortDate } from './timeline';
import { calculateProviderConcentration } from './cost';
import type { ServiceTone } from './portfolio';

/** A renewal you pay by hand can be marked paid (one-time, free and cancelled ones can't). */
export const canMarkPaid = (s: ServiceLink) =>
  !s.autoRenew && !!s.renewalDate && s.status !== 'cancelled' && s.billingCycle !== 'one-time' && s.billingCycle !== 'free';

/** When a service is next due: a trial's end, otherwise its renewal date. */
export const nextDate = (s: ServiceLink): string | undefined => (s.status === 'trial' && s.trialEndsAt ? s.trialEndsAt : s.renewalDate) || undefined;

const DAY = 86_400_000;
const parts = (iso: string) => iso.slice(0, 10).split('-').map(Number);

/** The date `days` after `iso` (YYYY-MM-DD). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY).toISOString().slice(0, 10);
}

/** The last day of the month `iso` is in. */
export function monthEnd(iso: string): string {
  const [y, m] = parts(iso);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

const monthName = (iso: string) => {
  const [y, m] = parts(iso);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
};
const monthIndex = (iso: string) => parts(iso)[0] * 12 + parts(iso)[1] - 1;

/** "Dec 1"; a date about a year away (or ago) gets its year, so it doesn't read as this year. */
export const dayLabel = (iso: string, daysDiff: number) => (Math.abs(daysDiff) > 300 ? `${shortDate(iso)}, ${iso.slice(0, 4)}` : shortDate(iso));

export interface RenewHow {
  tone: ServiceTone;
  /** The pill on a Timeline row: "Auto-renews", "Usage-based", "Renew by hand", "Free plan"… */
  label: string;
  /** The same in a word or two, after a date: "Dec 7 · auto". */
  short: string;
}

/** How a service renews (or why it doesn't). */
export function howItRenews(s: ServiceLink): RenewHow {
  if (s.status === 'cancelled') return { tone: 'none', label: 'Cancelled', short: 'cancelled' };
  if (s.status === 'paused') return { tone: 'none', label: 'Paused', short: 'paused' };
  if (s.billingCycle === 'free') return { tone: 'free', label: 'Free plan', short: 'free' };
  if (s.status === 'trial') return { tone: 'manual', label: 'Free trial', short: 'trial' };
  if (s.billingCycle === 'one-time') return { tone: 'none', label: 'Paid once', short: 'once' };
  if (s.billingCycle === 'usage-based')
    return s.autoRenew ? { tone: 'usage', label: 'Usage-based', short: 'usage' } : { tone: 'manual', label: 'Usage, by hand', short: 'usage, by hand' };
  return s.autoRenew ? { tone: 'auto', label: 'Auto-renews', short: 'auto' } : { tone: 'manual', label: 'Renew by hand', short: 'by hand' };
}

/** The pill on a Portfolio row: "Dec 7 · auto", "Overdue · Nov 20", "Trial ends Dec 7", "Free plan". */
export function whenPill(s: ServiceLink, today: string): { tone: ServiceTone; label: string } {
  const how = howItRenews(s);
  if (s.status === 'cancelled' || s.status === 'paused' || s.billingCycle === 'free' || s.billingCycle === 'one-time')
    return { tone: how.tone, label: how.label };
  const date = nextDate(s);
  if (!date) return { tone: 'none', label: s.status === 'trial' ? 'Free trial · no date' : `No date · ${how.short}` };
  const d = getDaysDiff(today, date);
  const day = dayLabel(date, d);
  if (s.status === 'trial') return d < 0 ? { tone: 'overdue', label: `Trial ended ${day}` } : { tone: 'manual', label: `Trial ends ${day}` };
  if (d < 0) return { tone: 'overdue', label: `Overdue · ${day}` };
  return { tone: how.tone, label: `${day} · ${how.short}` };
}

/** The date cell on a Timeline row: "Dec 1" over "in 8 days", or "—" over why there's no date. */
export function dateCell(s: ServiceLink, today: string): { date: string; rel: string; overdue: boolean } {
  const date = nextDate(s);
  const stopped = s.status === 'cancelled' || s.status === 'paused';
  if (!stopped && (s.billingCycle === 'free' || s.billingCycle === 'one-time')) return { date: '—', rel: 'no renewal', overdue: false };
  if (!date) return { date: '—', rel: 'no date set', overdue: false };
  const d = getDaysDiff(today, date);
  return { date: dayLabel(date, d), rel: relativeDays(d), overdue: d < 0 && !stopped };
}

const CYCLE: Record<ServiceLink['billingCycle'], string> = {
  monthly: 'Monthly',
  yearly: 'Yearly',
  'one-time': 'One-time',
  'usage-based': 'Usage-based',
  free: 'Free',
};
/** The plan's name, or how it's billed when there's none. */
export const planLabel = (s: ServiceLink) => s.plan?.trim() || CYCLE[s.billingCycle] || s.billingCycle;

/** The price in the other currency: birr for a dollar price, dollars for a birr one ('' when free). */
export function otherCurrency(s: Pick<ServiceLink, 'cost' | 'currency' | 'billingCycle'>, etbPerUsd: number): string {
  if (s.billingCycle === 'free' || !(s.cost > 0) || !(etbPerUsd > 0)) return '';
  return s.currency === 'USD'
    ? formatCurrency(Math.round(s.cost * etbPerUsd), 'ETB')
    : formatCurrency(Math.round((s.cost / etbPerUsd) * 100) / 100, 'USD');
}

// ---------------------------------------------------------------------------------------------------
// Timeline: services grouped by when they renew
// ---------------------------------------------------------------------------------------------------

export type RenewGroupKey = 'overdue' | 'soon' | 'month' | 'later' | 'none' | 'free' | 'stopped';
const GROUP_ORDER: RenewGroupKey[] = ['overdue', 'soon', 'month', 'later', 'none', 'free', 'stopped'];
/** "Next 2 weeks". */
export const SOON_DAYS = 14;

/** Which group a service falls in. Free, paid-once, paused and cancelled ones have their own groups. */
export function renewGroupKey(s: ServiceLink, today: string): RenewGroupKey {
  if (s.status === 'cancelled' || s.status === 'paused') return 'stopped';
  if (s.billingCycle === 'free') return 'free';
  const date = nextDate(s);
  if (!date || s.billingCycle === 'one-time') return 'none';
  const d = getDaysDiff(today, date);
  if (d < 0) return 'overdue';
  if (d <= SOON_DAYS) return 'soon';
  if (date.slice(0, 10) <= monthEnd(addDays(today, SOON_DAYS))) return 'month';
  return 'later';
}

/** "January – March"; with years once the months could be read as this year's ("January – November 2027"). */
export function monthSpan(from: string, to: string, today: string): string {
  const withYear = monthIndex(to) - monthIndex(today) >= 12;
  const [y1, y2] = [from.slice(0, 4), to.slice(0, 4)];
  if (monthIndex(from) === monthIndex(to)) return withYear ? `${monthName(from)} ${y1}` : monthName(from);
  if (!withYear) return `${monthName(from)} – ${monthName(to)}`;
  return y1 === y2 ? `${monthName(from)} – ${monthName(to)} ${y2}` : `${monthName(from)} ${y1} – ${monthName(to)} ${y2}`;
}

/** Soonest first; services without a date by name. */
export function byWhen(today: string) {
  return (a: ServiceLink, b: ServiceLink) => {
    const ga = GROUP_ORDER.indexOf(renewGroupKey(a, today));
    const gb = GROUP_ORDER.indexOf(renewGroupKey(b, today));
    if (ga !== gb) return ga - gb;
    const da = ga <= 3 ? nextDate(a) ?? '' : '';
    const db = gb <= 3 ? nextDate(b) ?? '' : '';
    return da.localeCompare(db) || a.providerName.localeCompare(b.providerName);
  };
}

export interface RenewGroup {
  key: RenewGroupKey;
  /** "Next 2 weeks · Nov 23–Dec 7", "Later in December", "January – March", "Free plans". */
  label: string;
  services: ServiceLink[];
}

/** Services by when they renew: overdue, next 2 weeks, later this month, later, no date, free, stopped. Empty groups are left out. */
export function renewalGroups(services: ServiceLink[], today: string): RenewGroup[] {
  const sorted = [...services].sort(byWhen(today));
  const soonEnd = addDays(today, SOON_DAYS);
  const out: RenewGroup[] = [];
  for (const key of GROUP_ORDER) {
    const own = sorted.filter((s) => renewGroupKey(s, today) === key);
    if (!own.length) continue;
    let label: string;
    if (key === 'overdue') label = 'Overdue';
    else if (key === 'soon') label = `Next 2 weeks · ${dateRange(today, soonEnd)}`;
    else if (key === 'month') label = `Later in ${monthName(soonEnd)}`;
    else if (key === 'later') label = monthSpan(nextDate(own[0])!, nextDate(own[own.length - 1])!, today);
    else if (key === 'none') label = 'No renewal date';
    else if (key === 'free') label = 'Free plans';
    else label = 'Paused or cancelled';
    out.push({ key, label, services: own });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Portfolio: services by app and by provider
// ---------------------------------------------------------------------------------------------------

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "4 services", or "2 of 4 services" when a filter hides some. */
export const countLabel = (shown: number, total: number) => (shown === total ? plural(total, 'service') : `${shown} of ${plural(total, 'service')}`);

/** An app's status as a pill. */
export function appStatus(status: ProductStatus): { tone: 'ok' | 'warn' | 'date' | 'none'; label: string } {
  if (status === 'live') return { tone: 'ok', label: 'Live' };
  if (status === 'building') return { tone: 'warn', label: 'Building' };
  if (status === 'idea') return { tone: 'date', label: 'Idea' };
  return { tone: 'none', label: status === 'paused' ? 'Paused' : 'Retired' };
}

export interface AppCard {
  /** The app, or undefined for services whose app is gone. */
  product?: Product;
  name: string;
  /** What the app costs a month (as on the Dashboard); undefined for services without an app. */
  monthlyUsd?: number;
  monthlyEtb?: number;
  /** All its services, whatever the filters. */
  total: number;
  /** The ones that match the filters, soonest first. */
  services: ServiceLink[];
}

/**
 * One card per app, most expensive first (the Dashboard's order). With `showEmpty` off, apps with no
 * matching service are left out. Services whose app no longer exists come last, under "No app".
 */
export function appCards(products: Product[], all: ServiceLink[], shown: ServiceLink[], today: string, etbPerUsd: number, showEmpty: boolean): AppCard[] {
  const sort = byWhen(today);
  const cards: AppCard[] = monthlyCostByApp(products, all, etbPerUsd)
    .map((c) => ({
      product: c.product,
      name: c.product.name,
      monthlyUsd: c.monthlyUsd,
      monthlyEtb: c.monthlyEtb,
      total: all.filter((s) => s.productId === c.product.id).length,
      services: shown.filter((s) => s.productId === c.product.id).sort(sort),
    }))
    .filter((c) => showEmpty || c.services.length > 0);
  const ids = new Set(products.map((p) => p.id));
  const orphans = shown.filter((s) => !ids.has(s.productId)).sort(sort);
  if (orphans.length) cards.push({ name: 'No app', total: all.filter((s) => !ids.has(s.productId)).length, services: orphans });
  return cards;
}

export interface ProviderCard {
  name: string;
  /** The apps that use it, by name. */
  apps: string[];
  /** What it costs a month across all apps (cancelled left out). */
  monthlyUsd: number;
  total: number;
  services: ServiceLink[];
}

const providerKey = (s: ServiceLink) => s.providerName.trim() || 'No provider';

/** One card per provider that has a matching service: the most shared first, then the most expensive. */
export function providerCards(products: Product[], all: ServiceLink[], shown: ServiceLink[], today: string, etbPerUsd: number): ProviderCard[] {
  const stats = new Map(calculateProviderConcentration(all, products.length, etbPerUsd).map((p) => [p.providerName, p]));
  const names = new Map(products.map((p) => [p.id, p.name]));
  const groups = new Map<string, ServiceLink[]>();
  for (const s of shown) groups.set(providerKey(s), [...(groups.get(providerKey(s)) ?? []), s]);

  const sort = byWhen(today);
  return [...groups.entries()]
    .map(([name, own]) => {
      const every = all.filter((s) => providerKey(s) === name);
      const live = every.filter((s) => s.status !== 'cancelled');
      const apps = [...new Set((live.length ? live : every).map((s) => names.get(s.productId) ?? 'No app'))].sort((a, b) => a.localeCompare(b));
      return { name, apps, monthlyUsd: stats.get(name)?.monthlyCostUsd ?? 0, total: every.length, services: own.sort(sort) };
    })
    .sort((a, b) => b.apps.length - a.apps.length || b.monthlyUsd - a.monthlyUsd || a.name.localeCompare(b.name));
}

/** How many providers more than one app uses. */
export const sharedProviderCount = (all: ServiceLink[], productCount: number, etbPerUsd: number) =>
  calculateProviderConcentration(all, productCount, etbPerUsd).filter((p) => p.productCount > 1).length;

/** "StackTrack", "StackTrack and Addis Bites", "StackTrack, Addis Bites and YG Retails". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
