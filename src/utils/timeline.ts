/**
 * Numbers and positions for the Timeline layout's Dashboard: what's due, placed on a line for the
 * next 60 days, and each app's monthly cost. Pure, so they are easy to test.
 */
import type { DueSoonGroup, ImportantDate, Product, ServiceLink } from '../types';
import { toUsd } from './summary';
import { calculateMonthlyCost } from './cost';

type DueItem = DueSoonGroup['items'][number];

/** auto: the provider charges by itself. usage: the price changes with use. manual: you renew it. date: a date to act on. */
export type DueTone = 'auto' | 'usage' | 'manual' | 'date';

export interface DueRow {
  id: string;
  kind: 'renewal' | 'date';
  name: string;
  appName: string;
  productId?: string;
  dueDate: string;
  daysDiff: number;
  usd?: number;
  etb?: number;
  tone: DueTone;
  /** Short words for the pill: "Auto-renews", "Usage-based", "Renew by hand", "Domain expiry". */
  label: string;
  service?: ServiceLink;
  date?: ImportantDate;
}

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Everything overdue or due within `days`, soonest first. Free and paused services are left out:
 * nothing is charged for them.
 */
export function dueRows(groups: DueSoonGroup[], etbPerUsd: number, days = 60): DueRow[] {
  const rows: DueRow[] = [];
  for (const item of groups.flatMap((g) => g.items) as DueItem[]) {
    if (item.daysDiff > days) continue;
    if (item.type === 'renewal') {
      const s = item.rawServiceItem;
      if (!s || s.billingCycle === 'free' || s.status === 'paused' || s.status === 'cancelled') continue;
      const usd = toUsd(s.cost || 0, s.currency, etbPerUsd);
      const tone: DueTone = s.billingCycle === 'usage-based' ? 'usage' : s.autoRenew ? 'auto' : 'manual';
      rows.push({
        id: item.id,
        kind: 'renewal',
        name: s.providerName,
        appName: item.productName,
        productId: item.productId,
        dueDate: item.dueDate,
        daysDiff: item.daysDiff,
        usd,
        etb: usd * etbPerUsd,
        tone,
        label: tone === 'usage' ? 'Usage-based' : tone === 'auto' ? 'Auto-renews' : 'Renew by hand',
        service: s,
      });
    } else {
      rows.push({
        id: item.id,
        kind: 'date',
        name: item.title,
        appName: item.productName,
        productId: item.productId,
        dueDate: item.dueDate,
        daysDiff: item.daysDiff,
        tone: 'date',
        label: capitalise(String(item.dateType || 'Date')),
        date: item.rawDateItem,
      });
    }
  }
  return rows.sort((a, b) => a.daysDiff - b.daysDiff || a.name.localeCompare(b.name));
}

/** "Dec 1" for 2026-12-01. */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "Dec 1", "Dec 1–4", or "Nov 29–Dec 2". */
export function dateRange(from: string, to: string): string {
  if (from === to) return shortDate(from);
  const end = shortDate(to);
  return `${shortDate(from)}–${from.slice(0, 7) === to.slice(0, 7) ? end.split(' ')[1] : end}`;
}

export interface TimelineMark {
  /** Where on the line, 0 (today) to 1 (the end of the window). */
  at: number;
  /** Labels sit above or below the line, whichever has room. */
  side: 'above' | 'below';
  /** Labels near the ends line up with the dot instead of centring, so they stay inside the line. */
  align: 'start' | 'center' | 'end';
  rows: DueRow[];
  tone: DueTone;
  /** "Dec 1", or "Dec 1–4" for a group. */
  when: string;
  /** Total in USD of the rows that have an amount (undefined when none do). */
  usd?: number;
}

/** When a group has more than one kind, the dot shows the one that needs you most. */
const TONE_WEIGHT: Record<DueTone, number> = { manual: 4, usage: 3, date: 2, auto: 1 };

/**
 * How wide a label is, as a share of the line at its narrowest (a 124px label on a 760px line, plus a
 * little gap). Wider screens only add room.
 */
export const LABEL_WIDTH = 0.17;

const alignAt = (at: number, width = LABEL_WIDTH): TimelineMark['align'] =>
  at < width / 2 ? 'start' : at > 1 - width / 2 ? 'end' : 'center';

/** Where a label sits along the line, as [from, to]. */
export function labelSpan(at: number, align: TimelineMark['align'], width = LABEL_WIDTH): [number, number] {
  if (align === 'start') return [at, at + width];
  if (align === 'end') return [at - width, at];
  return [at - width / 2, at + width / 2];
}

/**
 * The marks on the line for the next `windowDays` days. Items within `groupDays` of each other share one
 * mark ("3 due"). `labelWidth` is a label's share of the line (wider screens: smaller share, more marks).
 * Labels alternate above and below the line; a label that would overlap the one before it
 * on that side goes to the other side, and if neither side has room it joins the mark before it. So labels
 * never overlap.
 */
export function timelineMarks(rows: DueRow[], windowDays = 60, groupDays = 4, labelWidth = LABEL_WIDTH): TimelineMark[] {
  const upcoming = rows.filter((r) => r.daysDiff >= 0 && r.daysDiff <= windowDays).sort((a, b) => a.daysDiff - b.daysDiff);
  const placed: { rows: DueRow[]; at: number; side: TimelineMark['side'] }[] = [];
  const lastEnd = { above: -Infinity, below: -Infinity };

  for (const r of upcoming) {
    const prev = placed[placed.length - 1];
    if (prev && r.daysDiff - prev.rows[0].daysDiff <= groupDays) {
      prev.rows.push(r);
      continue;
    }
    const at = r.daysDiff / windowDays;
    const [from, to] = labelSpan(at, alignAt(at, labelWidth), labelWidth);
    const preferred: TimelineMark['side'] = prev?.side === 'above' ? 'below' : 'above';
    const other: TimelineMark['side'] = preferred === 'above' ? 'below' : 'above';
    const side = lastEnd[preferred] <= from ? preferred : lastEnd[other] <= from ? other : null;
    if (!side) {
      prev!.rows.push(r); // both sides are taken here, so there is a mark before this one
      continue;
    }
    lastEnd[side] = to;
    placed.push({ rows: [r], at, side });
  }

  return placed.map(({ rows: g, at, side }) => {
    const priced = g.filter((r) => r.usd !== undefined);
    return {
      at,
      side,
      align: alignAt(at, labelWidth),
      rows: g,
      tone: g.reduce<DueTone>((t, r) => (TONE_WEIGHT[r.tone] > TONE_WEIGHT[t] ? r.tone : t), g[0].tone),
      when: dateRange(g[0].dueDate, g[g.length - 1].dueDate),
      usd: priced.length ? priced.reduce((sum, r) => sum + (r.usd || 0), 0) : undefined,
    };
  });
}

/** The first day of each month inside the window, as ticks on the line. */
export function monthTicks(today: string, windowDays = 60): { at: number; label: string }[] {
  const [y, m, d] = today.slice(0, 10).split('-').map(Number);
  const start = Date.UTC(y, m - 1, d);
  const ticks: { at: number; label: string }[] = [];
  for (let i = 1; i <= 3; i++) {
    const first = Date.UTC(y, m - 1 + i, 1);
    const days = Math.round((first - start) / 86_400_000);
    if (days > windowDays) break;
    const at = days / windowDays;
    if (at > 0.95) break; // too close to the end to label
    ticks.push({ at, label: new Date(first).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }) });
  }
  return ticks;
}

export interface AppCost {
  product: Product;
  monthlyUsd: number;
  monthlyEtb: number;
  serviceCount: number;
}

/**
 * What each app costs a month, most expensive first. Same rule as the workspace total (calculateMonthlyCost:
 * monthly as is, yearly / 12, usage-based at its listed price; free and one-time count 0; cancelled left out),
 * so the apps add up to the total.
 */
export function monthlyCostByApp(products: Product[], services: ServiceLink[], etbPerUsd: number): AppCost[] {
  return products
    .map((product) => {
      const own = services.filter((s) => s.productId === product.id && s.status !== 'cancelled');
      let monthlyUsd = 0;
      for (const s of own) {
        monthlyUsd += toUsd(calculateMonthlyCost(s.cost, s.billingCycle), s.currency, etbPerUsd);
      }
      return {
        product,
        monthlyUsd: Math.round(monthlyUsd * 100) / 100,
        monthlyEtb: Math.round(monthlyUsd * etbPerUsd * 100) / 100,
        serviceCount: own.length,
      };
    })
    .sort((a, b) => b.monthlyUsd - a.monthlyUsd);
}
