/**
 * Numbers for the dashboard "at a glance" cards. Pure, so they are easy to test.
 */
import type { Currency, ServiceLink } from '../types';
import type { DomainExpiryItem } from './domainExpiry';
import { getDaysDiff } from './reminders';

export interface UpcomingSummary {
  renewals: { count: number; totalUsd: number; next?: { title: string; daysDiff: number } };
  domains: { count: number; expired: number; next?: { title: string; daysDiff: number } };
}

export const toUsd = (amount: number, currency: Currency, etbPerUsd: number) =>
  currency === 'ETB' ? amount / (etbPerUsd || 1) : amount;

export function summarizeUpcoming(
  services: ServiceLink[],
  domains: DomainExpiryItem[],
  etbPerUsd: number,
  today: string,
  renewalWindowDays = 30,
  domainWindowDays = 60
): UpcomingSummary {
  const renewals = services
    .filter((s) => (s.status === 'active' || s.status === 'trial') && s.renewalDate && s.billingCycle !== 'free')
    .map((s) => ({ s, daysDiff: getDaysDiff(today, s.renewalDate!) }))
    .filter((r) => r.daysDiff >= 0 && r.daysDiff <= renewalWindowDays)
    .sort((a, b) => a.daysDiff - b.daysDiff);

  const domainRows = domains
    .map((d) => ({ d, daysDiff: getDaysDiff(today, d.dueDate) }))
    .filter((r) => r.daysDiff <= domainWindowDays)
    .sort((a, b) => a.daysDiff - b.daysDiff);

  return {
    renewals: {
      count: renewals.length,
      totalUsd: renewals.reduce((sum, r) => sum + toUsd(r.s.cost || 0, r.s.currency, etbPerUsd), 0),
      next: renewals[0] ? { title: renewals[0].s.providerName, daysDiff: renewals[0].daysDiff } : undefined,
    },
    domains: {
      count: domainRows.length,
      expired: domainRows.filter((r) => r.daysDiff < 0).length,
      next: domainRows[0] ? { title: domainRows[0].d.domainName, daysDiff: domainRows[0].daysDiff } : undefined,
    },
  };
}

/** "today", "tomorrow", "in 5 days", "3 days ago" */
export function relativeDays(daysDiff: number): string {
  if (daysDiff === 0) return 'today';
  if (daysDiff === 1) return 'tomorrow';
  if (daysDiff > 1) return `in ${daysDiff} days`;
  if (daysDiff === -1) return 'yesterday';
  return `${-daysDiff} days ago`;
}
