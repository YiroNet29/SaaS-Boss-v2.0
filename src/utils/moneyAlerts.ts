/**
 * Money alerts: top-ups needed before a card runs short, cards about to expire, and a monthly
 * "you owe" summary. Pure, so the reminder job and the dashboard show exactly the same thing.
 */
import type { Payment, PaymentSource, ServiceLink, SourceTransaction } from '../types';
import { daysUntilExpiry, planTopUp, summarizeSource, upcomingCharges } from './ledger';
import { formatCurrency } from './formatters';
import { relativeDays } from './summary';

export const TOP_UP_LEAD_DAYS = [7, 3, 1, 0];
export const EXPIRY_LEAD_DAYS = [30, 14, 7, 1, 0];

export interface MoneyAlert {
  kind: 'top_up' | 'expiry' | 'owed';
  sourceId: string;
  /** Unique per event (source + what + target date); used to send each alert only once. */
  itemId: string;
  leadDay: number;
  severity: 'warn' | 'danger';
  text: string;
}

const dual = (n: number, currency: 'USD' | 'ETB', rate: number) =>
  currency === 'USD'
    ? `${formatCurrency(n, 'USD')} (≈ ${formatCurrency(Math.round(n * rate), 'ETB')})`
    : `${formatCurrency(n, 'ETB')} (≈ ${formatCurrency(Math.round(n / rate), 'USD')})`;

export interface MoneyAlertInput {
  sources: PaymentSource[];
  services: ServiceLink[];
  payments: Payment[];
  transactions: SourceTransaction[];
  etbPerUsd: number;
  today: string;
}

/**
 * Every money alert that applies today. With `onlyLeadDays` (the reminder job) only alerts that
 * fall exactly on a lead day are returned; without it (the dashboard) everything current is shown.
 */
export function computeMoneyAlerts(input: MoneyAlertInput, opts: { onlyLeadDays?: boolean } = {}): MoneyAlert[] {
  const { sources, services, payments, transactions, etbPerUsd: rate, today } = input;
  const out: MoneyAlert[] = [];

  for (const source of sources.filter((s) => !s.archived)) {
    const { balance } = summarizeSource(source, payments, transactions, rate);
    const users = services.filter((s) => s.paymentSourceId === source.id && s.status !== 'cancelled');

    if (source.prepaid) {
      const plan = planTopUp(balance, upcomingCharges(source, services, today, rate, 30), source.lowBalance ?? 0);
      const days = plan.daysLeft ?? 0;
      if (plan.needed > 0 && (!opts.onlyLeadDays || TOP_UP_LEAD_DAYS.includes(days))) {
        out.push({
          kind: 'top_up',
          sourceId: source.id,
          itemId: `${source.id}:topup:${plan.by}`,
          leadDay: days,
          severity: days <= 3 ? 'danger' : 'warn',
          text:
            `💳 Top up ${source.name} by ${dual(plan.needed, source.currency, rate)} before ${plan.by} (${relativeDays(days)}). ` +
            `${plan.firstShortCharge?.name} (${formatCurrency(plan.firstShortCharge?.amount ?? 0, source.currency)}) would fail.`,
        });
      }
    }

    const expiry = daysUntilExpiry(source, today);
    if (expiry !== null && users.length > 0) {
      const due = opts.onlyLeadDays ? EXPIRY_LEAD_DAYS.includes(expiry) : expiry <= 45;
      if (due) {
        const names = users.slice(0, 4).map((s) => s.providerName).join(', ') + (users.length > 4 ? '…' : '');
        out.push({
          kind: 'expiry',
          sourceId: source.id,
          itemId: `${source.id}:expiry:${source.expiresOn}`,
          leadDay: Math.max(0, expiry),
          severity: expiry <= 14 ? 'danger' : 'warn',
          text:
            expiry < 0
              ? `🪪 ${source.name} has expired. ${users.length} service(s) still charge it: ${names}.`
              : `🪪 ${source.name} expires ${relativeDays(expiry)} (${source.expiresOn}). Move these to a new card: ${names}.`,
        });
      }
    }

    if (source.kind === 'person' && balance > 0.5) {
      const monthly = today.slice(8, 10) === '01';
      if (!opts.onlyLeadDays || monthly) {
        out.push({
          kind: 'owed',
          sourceId: source.id,
          itemId: `${source.id}:owed:${today.slice(0, 7)}`,
          leadDay: 0,
          severity: 'warn',
          text: `🤝 You owe ${source.name} ${dual(balance, source.currency, rate)}. Record it with "Settle up" once you've paid them back.`,
        });
      }
    }
  }
  return out;
}
