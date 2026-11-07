/**
 * Money math for payment sources: balances, what you owe a person, upcoming charges per card,
 * and how much to top up by when. Pure functions, unit-tested.
 */
import type { BillingCycle, Currency, Payment, PaymentSource, ServiceLink, SourceTransaction } from '../types';
import { getDaysDiff } from './reminders';
import { addMonthsAnchored, cycleMonths } from './renewals';

/** One payment per service renewal cycle: the same id from the app, the cron job and Telegram. */
export const renewalPaymentId = (serviceId: string, dueDate: string) =>
  `pay-${serviceId}-${dueDate.slice(0, 10).replace(/-/g, '')}`;

export function convert(amount: number, from: Currency, to: Currency, etbPerUsd: number): number {
  if (from === to) return amount;
  return from === 'USD' ? amount * etbPerUsd : amount / (etbPerUsd || 1);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface SourceSummary {
  /** Prepaid card: money left on it. Person: what you owe them. Others: total paid this month. */
  balance: number;
  paidTotal: number;
  topUps: number;
  repaid: number;
}

/** Balance of a source, in its own currency. */
export function summarizeSource(
  source: PaymentSource,
  payments: Payment[],
  txns: SourceTransaction[],
  etbPerUsd: number
): SourceSummary {
  const paidTotal = payments
    .filter((p) => p.sourceId === source.id)
    .reduce((sum, p) => sum + convert(Number(p.amount) || 0, p.currency, source.currency, etbPerUsd), 0);
  const mine = txns.filter((t) => t.sourceId === source.id);
  const topUps = mine.filter((t) => t.kind === 'top_up').reduce((s, t) => s + Number(t.amount || 0), 0);
  const repaid = mine.filter((t) => t.kind === 'repayment').reduce((s, t) => s + Number(t.amount || 0), 0);
  const adjust = mine.filter((t) => t.kind === 'adjustment').reduce((s, t) => s + Number(t.amount || 0), 0);

  let balance: number;
  if (source.kind === 'person') balance = paidTotal - repaid + adjust; // what you owe them
  else balance = Number(source.openingBalance || 0) + topUps + adjust - paidTotal; // money left
  return { balance: round2(balance), paidTotal: round2(paidTotal), topUps: round2(topUps), repaid: round2(repaid) };
}

export interface UpcomingCharge {
  serviceId: string;
  name: string;
  date: string;
  daysDiff: number;
  /** In the source's currency. */
  amount: number;
}

/** Renewals charged to this source within the next `days` days (today included). */
export function upcomingCharges(
  source: PaymentSource,
  services: ServiceLink[],
  today: string,
  etbPerUsd: number,
  days = 30
): UpcomingCharge[] {
  return services
    .filter(
      (s) =>
        s.paymentSourceId === source.id &&
        (s.status === 'active' || s.status === 'trial') &&
        s.renewalDate &&
        s.billingCycle !== 'free' &&
        (s.cost || 0) > 0
    )
    .map((s) => ({
      serviceId: s.id,
      name: s.providerName,
      date: s.renewalDate!.slice(0, 10),
      daysDiff: getDaysDiff(today, s.renewalDate!),
      amount: round2(convert(s.cost, s.currency, source.currency, etbPerUsd)),
    }))
    .filter((c) => c.daysDiff >= 0 && c.daysDiff <= days)
    .sort((a, b) => a.daysDiff - b.daysDiff);
}

export interface TopUpPlan {
  /** Amount to add (source currency), rounded up to a whole unit. 0 = no top-up needed. */
  needed: number;
  /** Top up before this charge date. */
  by?: string;
  daysLeft?: number;
  /** The charge that would fail first. */
  firstShortCharge?: UpcomingCharge;
  balanceAfter: number;
}

/**
 * Walks the upcoming charges in date order. If the balance would drop below the low-balance
 * floor (default 0), says how much to top up and by which date.
 */
export function planTopUp(balance: number, charges: UpcomingCharge[], floor = 0): TopUpPlan {
  let running = balance;
  let lowest = balance;
  let first: UpcomingCharge | undefined;
  for (const c of charges) {
    running -= c.amount;
    if (running < floor && !first) first = c;
    lowest = Math.min(lowest, running);
  }
  if (!first) return { needed: 0, balanceAfter: round2(running) };
  return {
    needed: Math.ceil(floor - lowest),
    by: first.date,
    daysLeft: first.daysDiff,
    firstShortCharge: first,
    balanceAfter: round2(running),
  };
}

/** Days until a card expires (negative = expired), or null when no expiry is set. */
export function daysUntilExpiry(source: PaymentSource, today: string): number | null {
  if (!source.expiresOn) return null;
  return getDaysDiff(today, source.expiresOn);
}

/** Last day of a YYYY-MM month, for card expiry dates. */
export function endOfMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Renewal dates an auto-renewal moved past (each one was a charge): from `from` up to but not
 * including `to`, one per billing cycle.
 */
export function crossedRenewals(from: string, to: string, cycle: BillingCycle, anchorDay?: number): string[] {
  const step = cycleMonths(cycle);
  if (!step) return [];
  const base = from.slice(0, 10);
  const anchor = anchorDay ?? Number(base.slice(8, 10));
  const out: string[] = [];
  for (let k = 0; k < 600; k++) {
    const d = k === 0 ? base : addMonthsAnchored(base, k * step, anchor);
    if (d >= to) break;
    out.push(d);
  }
  return out;
}
