/**
 * Monthly budget per app: what was paid this month against it, and the 80% / 100% alerts.
 * Pure functions, unit-tested. Budgets are in USD; birr payments count at the workspace rate.
 */
import type { Payment, Product, ServiceLink } from '../types';
import { formatCurrency } from './formatters';

export const BUDGET_LEVELS = [80, 100] as const;
export type BudgetLevel = (typeof BUDGET_LEVELS)[number];

/** USD paid per app in one month ("2026-11"), from the payments ledger. */
export function paidByAppInMonth(
  payments: Pick<Payment, 'serviceLinkId' | 'paidOn' | 'amount' | 'currency'>[],
  services: Pick<ServiceLink, 'id' | 'productId'>[],
  month: string,
  etbPerUsd: number
): Map<string, number> {
  const appOf = new Map(services.map((s) => [s.id, s.productId]));
  const out = new Map<string, number>();
  for (const p of payments) {
    if (!p.paidOn?.startsWith(month) || !p.serviceLinkId) continue;
    const app = appOf.get(p.serviceLinkId);
    if (!app) continue;
    const usd = p.currency === 'ETB' ? Number(p.amount) / (etbPerUsd || 155) : Number(p.amount);
    out.set(app, (out.get(app) ?? 0) + (Number.isFinite(usd) ? usd : 0));
  }
  return out;
}

export interface BudgetUse {
  budget: number;
  spent: number;
  /** Whole percent used, e.g. 85. */
  percent: number;
  /** The highest alert level reached (0 = under 80%). */
  level: 0 | BudgetLevel;
}

export function budgetUse(budget: number | null | undefined, spent: number): BudgetUse | null {
  if (!budget || budget <= 0) return null;
  const percent = Math.round((spent / budget) * 100);
  const level = spent >= budget ? 100 : spent >= budget * 0.8 ? 80 : 0;
  return { budget, spent: Math.round(spent * 100) / 100, percent, level };
}

export interface BudgetAlert extends BudgetUse {
  productId: string;
  name: string;
  /** Which month ("2026-11") the payments are from. */
  month: string;
  level: BudgetLevel;
  /** Every level this alert covers (crossing 100% at once also settles 80%). */
  covers: BudgetLevel[];
  text: string;
}

/**
 * The new alerts for one month: one per app, at the highest level reached and not yet sent.
 * `period` is how the month reads in the message: "this month", or "in November" for the month just ended.
 */
export function budgetAlerts(
  products: Pick<Product, 'id' | 'name' | 'monthlyBudget'>[],
  paid: Map<string, number>,
  alreadySent: (productId: string, level: BudgetLevel) => boolean,
  etbPerUsd: number,
  month = '',
  period = 'this month'
): BudgetAlert[] {
  const out: BudgetAlert[] = [];
  for (const p of products) {
    const use = budgetUse(p.monthlyBudget, paid.get(p.id) ?? 0);
    if (!use || !use.level || alreadySent(p.id, use.level)) continue;
    const level = use.level;
    const covers = BUDGET_LEVELS.filter((l) => l <= level && !alreadySent(p.id, l));
    const spent = `${formatCurrency(use.spent, 'USD')} (≈ ${formatCurrency(Math.round(use.spent * etbPerUsd), 'ETB')})`;
    const budget = formatCurrency(use.budget, 'USD');
    const text =
      level === 80
        ? `${p.name}: ${spent} paid ${period}, ${use.percent}% of its ${budget} budget.`
        : use.spent > use.budget
          ? `${p.name}: ${spent} paid ${period}, over its ${budget} budget (${use.percent}%).`
          : `${p.name}: ${spent} paid ${period}, all of its ${budget} budget.`;
    out.push({ ...use, level, covers, productId: p.id, name: p.name, month, text });
  }
  return out;
}

export const budgetAlertId = (productId: string, month: string) => `budget:${productId}:${month}`;
