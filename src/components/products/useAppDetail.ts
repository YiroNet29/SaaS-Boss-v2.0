import { ServiceLink } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { paidInLastYear } from '../../utils/reports';
import { calculateTotalMonthlyCost } from '../../utils/cost';
import { budgetUse, paidByAppInMonth } from '../../utils/budgets';
import { FALLBACK_ETB_PER_USD } from '../../utils/fx';
import { paidWithName } from '../../utils/appPages';

/** One app, its services and dates, and its money numbers (every layout's app page uses it). */
export function useAppDetail(productId: string) {
  const { products, services, dates, currentWorkspace, paymentSources, payments } = useWorkspace();

  const product = products.find((p) => p.id === productId);
  const prodServices = services.filter((s) => s.productId === productId);
  const prodDates = dates.filter((d) => d.productId === productId);

  const rate = currentWorkspace.exchangeRates.ETB_per_USD || FALLBACK_ETB_PER_USD;
  const costSummary = calculateTotalMonthlyCost(prodServices, currentWorkspace.baseCurrency, rate);
  // What it costs per year, and what was actually paid for it in the last 12 months.
  const paidYear = paidInLastYear(payments, new Set(prodServices.map((s) => s.id)), rate, new Date().toLocaleDateString('en-CA'));
  const thisMonth = new Date().toLocaleDateString('en-CA').slice(0, 7);
  const budget = product
    ? budgetUse(product.monthlyBudget, paidByAppInMonth(payments, services, thisMonth, rate).get(product.id) ?? 0)
    : null;
  /** The card or person that pays for a service, else its typed label. */
  const paidWith = (s: ServiceLink) => paidWithName(s, paymentSources);

  return { product, prodServices, prodDates, rate, costSummary, paidYear, budget, paidWith };
}
