/**
 * Auto-renew roll-forward: keeps renewal dates of auto-renewing services in the future.
 * Pure functions (no I/O) so the app and the cron job share the exact same rules.
 */
import type { BillingCycle, ServiceLink } from '../types';

/** Months per billing cycle. null = never rolls forward. */
export function cycleMonths(cycle: BillingCycle): number | null {
  switch (cycle) {
    case 'monthly':
    case 'usage-based':
      return 1;
    case 'yearly':
      return 12;
    default:
      return null; // 'one-time', 'free'
  }
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Adds whole months to a YYYY-MM-DD date. The day of month follows `anchorDay` but is clamped
 * to the month's length, so the 31st becomes Feb 28/29 and then the 31st again in March.
 */
export function addMonthsAnchored(dateStr: string, months: number, anchorDay: number): string {
  const [y, m] = dateStr.slice(0, 10).split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const monthIndex = total % 12;
  const day = Math.min(anchorDay, daysInMonth(year, monthIndex));
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Returns the first renewal date on or after `today`, stepping by whole billing cycles from
 * `renewalDate`. Returns null when nothing needs to change (already today or later, or the
 * cycle never renews).
 */
export function nextRenewalDate(
  renewalDate: string,
  cycle: BillingCycle,
  today: string,
  anchorDay?: number
): string | null {
  const step = cycleMonths(cycle);
  if (!step || !renewalDate) return null;
  const base = renewalDate.slice(0, 10);
  if (base >= today) return null;

  const anchor = anchorDay ?? Number(base.slice(8, 10));
  // Always step from the original date (not the previous result) so month-end clamping
  // never drifts the day: Jan 31 -> Feb 28 -> Mar 31.
  for (let k = 1; k <= 1200; k++) {
    const candidate = addMonthsAnchored(base, k * step, anchor);
    if (candidate >= today) return candidate;
  }
  return null;
}

/**
 * After a manual renewal is paid: the next renewal date, one cycle after the current one
 * (and never in the past). Returns null for one-time / free services.
 */
export function advanceAfterPayment(
  renewalDate: string,
  cycle: BillingCycle,
  today: string,
  anchorDay?: number
): string | null {
  const step = cycleMonths(cycle);
  if (!step || !renewalDate) return null;
  const base = renewalDate.slice(0, 10);
  const anchor = anchorDay ?? Number(base.slice(8, 10));
  for (let k = 1; k <= 1200; k++) {
    const candidate = addMonthsAnchored(base, k * step, anchor);
    if (candidate > today) return candidate;
  }
  return null;
}

export interface RollForward {
  id: string;
  workspaceId: string;
  providerName: string;
  from: string;
  to: string;
}

/** Which services should move forward today. Only active, auto-renewing services with a date. */
export function computeRollForwards(services: ServiceLink[], today: string): RollForward[] {
  const out: RollForward[] = [];
  for (const s of services) {
    if (!s.autoRenew || s.status !== 'active' || !s.renewalDate) continue;
    const anchorDay = s.startDate ? Number(s.startDate.slice(8, 10)) : undefined;
    const to = nextRenewalDate(s.renewalDate, s.billingCycle, today, anchorDay);
    if (to) {
      out.push({ id: s.id, workspaceId: s.workspaceId, providerName: s.providerName, from: s.renewalDate.slice(0, 10), to });
    }
  }
  return out;
}

const fmt = (d: string) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function describeRollForward(r: RollForward): string {
  return `Auto-renewed ${r.providerName}: ${fmt(r.from)} → ${fmt(r.to)}`;
}
