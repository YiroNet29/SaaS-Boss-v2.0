/**
 * Words and numbers for the Portfolio layout's Dashboard: each app's services as short lines, its budget
 * bar, and the shared costs (cards to top up, people you owe). Pure, so they are easy to test.
 */
import type { Payment, PaymentSource, ServiceCategory, ServiceLink, SourceTransaction } from '../types';
import type { BudgetUse } from './budgets';
import { formatCurrency } from './formatters';
import { getDaysDiff } from './reminders';
import { daysUntilExpiry, planTopUp, summarizeSource, upcomingCharges } from './ledger';
import { relativeDays } from './summary';
import { shortDate } from './timeline';

/** auto / usage / manual: how a dated renewal is paid. overdue: its date has passed. free / none: nothing to pay or no date. */
export type ServiceTone = 'auto' | 'usage' | 'manual' | 'overdue' | 'free' | 'none';

export interface ServiceLine {
  service: ServiceLink;
  name: string;
  /** "Hosting · renews by itself" */
  kind: string;
  /** "$20/mo", "$12.98/yr", "≈ $15/mo", "Free" */
  price: string;
  /** "Dec 7", "Trial ends Dec 7", "Overdue · Nov 20", "Free plan", "No date" */
  when: string;
  tone: ServiceTone;
  daysDiff: number | null;
}

const CATEGORY: Partial<Record<ServiceCategory, string>> = {
  'domain registrar': 'Domain',
  'email provider': 'Email',
  'payment processor': 'Payments',
  'error monitoring': 'Monitoring',
  auth: 'Sign-in',
};
export const categoryLabel = (c: ServiceCategory) => CATEGORY[c] ?? (c === c.toLowerCase() ? c[0].toUpperCase() + c.slice(1) : c);

export function priceLabel(s: Pick<ServiceLink, 'cost' | 'currency' | 'billingCycle'>): string {
  if (s.billingCycle === 'free') return 'Free';
  const amount = formatCurrency(Math.round((s.cost || 0) * 100) / 100, s.currency);
  if (s.billingCycle === 'monthly') return `${amount}/mo`;
  if (s.billingCycle === 'yearly') return `${amount}/yr`;
  if (s.billingCycle === 'usage-based') return `≈ ${amount}/mo`;
  return `${amount} once`;
}

export function serviceLine(s: ServiceLink, today: string): ServiceLine {
  const free = s.billingCycle === 'free';
  const trial = s.status === 'trial' && !!s.trialEndsAt;
  const how = free
    ? 'free plan'
    : trial
      ? 'free trial'
      : s.billingCycle === 'usage-based'
        ? 'usage-based'
        : s.billingCycle === 'one-time'
          ? 'paid once'
          : s.autoRenew
            ? 'renews by itself'
            : 'renew by hand';
  const base = { service: s, name: s.providerName, kind: `${categoryLabel(s.category)} · ${how}`, price: priceLabel(s) };
  if (free) return { ...base, when: 'Free plan', tone: 'free', daysDiff: null };

  const date = trial ? s.trialEndsAt! : s.renewalDate;
  if (!date) return { ...base, when: 'No date', tone: 'none', daysDiff: null };
  const daysDiff = getDaysDiff(today, date);
  if (daysDiff < 0) return { ...base, when: `Overdue · ${shortDate(date)}`, tone: 'overdue', daysDiff };
  const tone: ServiceTone = trial ? 'manual' : s.billingCycle === 'usage-based' ? 'usage' : s.autoRenew ? 'auto' : 'manual';
  // A date about a year away gets its year, so "Nov 20" next year doesn't read as last week.
  const day = daysDiff > 300 ? `${shortDate(date)}, ${date.slice(0, 4)}` : shortDate(date);
  return { ...base, when: trial ? `Trial ends ${day}` : day, tone, daysDiff };
}

const ORDER: Record<ServiceTone, number> = { overdue: 0, auto: 1, usage: 1, manual: 1, none: 2, free: 3 };

/** An app's services (cancelled left out): soonest date first, then those without a date, then free ones. */
export function appServiceLines(services: ServiceLink[], productId: string, today: string): ServiceLine[] {
  return services
    .filter((s) => s.productId === productId && s.status !== 'cancelled')
    .map((s) => serviceLine(s, today))
    .sort(
      (a, b) =>
        ORDER[a.tone] - ORDER[b.tone] || (a.daysDiff ?? 0) - (b.daysDiff ?? 0) || a.name.localeCompare(b.name)
    );
}

export interface BudgetLine {
  text: string;
  /** Bar width, 0–100. */
  width: number;
  tone: 'ok' | 'warn' | 'bad' | 'none';
}

/** The budget bar under an app's cost: what was paid this month against its budget (as the app's page and Telegram count it). */
export function budgetLine(use: BudgetUse | null): BudgetLine {
  if (!use) return { text: 'No budget set', width: 0, tone: 'none' };
  const usd = (n: number) => formatCurrency(n, 'USD');
  return {
    text:
      use.level === 100
        ? `Over budget: ${usd(use.spent)} paid of ${usd(use.budget)} this month`
        : `${usd(use.spent)} paid of the ${usd(use.budget)} budget this month (${use.percent}%)`,
    width: Math.min(100, Math.max(0, use.percent)),
    tone: use.level === 100 ? 'bad' : use.level === 80 ? 'warn' : 'ok',
  };
}

export interface SharedCost {
  source: PaymentSource;
  title: string;
  sub: string;
  status: string;
  tone: 'ok' | 'warn' | 'bad' | 'none';
  /** Higher = needs you sooner; the list is sorted by it. */
  priority: number;
}

export interface SharedCostInput {
  sources: PaymentSource[];
  payments: Payment[];
  transactions: SourceTransaction[];
  services: ServiceLink[];
  today: string;
  etbPerUsd: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Cards and people that pay for several apps, with what each needs from you: a top-up, a card about to
 * expire, or money you owe. Uses the same rules as Cards & Payments. Sources with nothing to show are left out.
 */
export function sharedCosts({ sources, payments, transactions, services, today, etbPerUsd }: SharedCostInput): SharedCost[] {
  const out: SharedCost[] = [];
  for (const source of sources) {
    if (source.archived) continue;
    const used = services.filter((s) => s.paymentSourceId === source.id && s.status !== 'cancelled').length;
    const { balance } = summarizeSource(source, payments, transactions, etbPerUsd);
    const money = (n: number) => formatCurrency(Math.round(n * 100) / 100, source.currency);
    const title = source.last4 ? `${source.name} ·· ${source.last4}` : source.name;

    if (source.kind === 'person') {
      const owe = balance > 0.005;
      if (!owe && used === 0) continue;
      out.push({
        source,
        title,
        sub: `pays for ${plural(used, 'service')}`,
        status: owe ? `You owe ${money(balance)}` : 'Nothing owed',
        tone: owe ? 'bad' : 'ok',
        priority: owe ? 3 : 0,
      });
      continue;
    }

    if (used === 0) continue;
    const left = balance < 0 ? `${money(-balance)} short` : `${money(balance)} left`;
    const sub = source.prepaid ? `pays ${plural(used, 'service')} · ${left}` : `pays ${plural(used, 'service')}`;
    const options: Omit<SharedCost, 'source' | 'title' | 'sub'>[] = [];
    if (source.prepaid) {
      const plan = planTopUp(balance, upcomingCharges(source, services, today, etbPerUsd, 30), source.lowBalance ?? 0);
      if (plan.needed > 0 && plan.by)
        options.push({
          status: `Top up ${money(plan.needed)} by ${shortDate(plan.by)}`,
          tone: (plan.daysLeft ?? 99) <= 3 ? 'bad' : 'warn',
          priority: (plan.daysLeft ?? 99) <= 3 ? 3 : 2,
        });
    }
    const expiry = daysUntilExpiry(source, today);
    if (expiry !== null && expiry <= 45)
      options.push(
        expiry < 0
          ? { status: 'Card expired', tone: 'bad', priority: 3 }
          : { status: `Expires ${relativeDays(expiry)}`, tone: expiry <= 14 ? 'bad' : 'warn', priority: expiry <= 14 ? 3 : 1 }
      );
    const pick = options.sort((a, b) => b.priority - a.priority)[0] ?? { status: 'Nothing to do', tone: 'none' as const, priority: 0 };
    out.push({ source, title, sub, ...pick });
  }
  return out.sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));
}

/** "addisbites.com" from "https://www.addisbites.com/menu". */
export function siteName(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
