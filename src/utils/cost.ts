import { Currency, ServiceLink, BillingCycle } from '../types';

/**
 * Calculates normalized monthly cost of a service link.
 * Yearly plans are divided by 12. Free or one-time plans return 0 for ongoing monthly cost.
 */
export function calculateMonthlyCost(cost: number, billingCycle: BillingCycle): number {
  if (!cost || cost < 0) return 0;
  switch (billingCycle) {
    case 'monthly':
      return cost;
    case 'yearly':
      return cost / 12;
    case 'usage-based':
      return cost;
    case 'one-time':
    case 'free':
    default:
      return 0;
  }
}

/**
 * Converts an amount from one currency to another using the ETB per USD exchange rate.
 * Supported currencies: USD and ETB.
 */
export function convertCurrency(
  amount: number,
  from: Currency,
  to: Currency,
  etbPerUsd: number
): number {
  if (amount === 0 || from === to) return amount;
  if (!etbPerUsd || etbPerUsd <= 0) return amount;

  if (from === 'USD' && to === 'ETB') {
    return amount * etbPerUsd;
  }
  if (from === 'ETB' && to === 'USD') {
    return amount / etbPerUsd;
  }
  return amount;
}

/**
 * Calculates total monthly cost of a list of service links in the target base currency.
 */
export function calculateTotalMonthlyCost(
  services: ServiceLink[],
  targetCurrency: Currency,
  etbPerUsd: number
): { totalInBase: number; totalUsd: number; totalEtb: number } {
  let totalUsd = 0;

  for (const s of services) {
    if (s.status === 'cancelled') continue;
    const monthlyCost = calculateMonthlyCost(s.cost, s.billingCycle);
    const inUsd = convertCurrency(monthlyCost, s.currency, 'USD', etbPerUsd);
    totalUsd += inUsd;
  }

  const totalEtb = totalUsd * etbPerUsd;
  const totalInBase = targetCurrency === 'ETB' ? totalEtb : totalUsd;

  return {
    totalInBase: Math.round(totalInBase * 100) / 100,
    totalUsd: Math.round(totalUsd * 100) / 100,
    totalEtb: Math.round(totalEtb * 100) / 100,
  };
}

/**
 * Calculates provider concentration across products.
 * Returns providers sorted by product count descending.
 */
export interface ProviderConcentrationStat {
  providerName: string;
  productCount: number;
  totalProducts: number;
  percentage: number;
  serviceCount: number;
  categories: string[];
  monthlyCostUsd: number;
}

export function calculateProviderConcentration(
  services: ServiceLink[],
  totalProductsCount: number,
  etbPerUsd: number
): ProviderConcentrationStat[] {
  const map = new Map<
    string,
    {
      productIds: Set<string>;
      serviceCount: number;
      categories: Set<string>;
      monthlyCostUsd: number;
    }
  >();

  for (const s of services) {
    if (s.status === 'cancelled') continue;
    const key = s.providerName.trim();
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, {
        productIds: new Set(),
        serviceCount: 0,
        categories: new Set(),
        monthlyCostUsd: 0,
      });
    }

    const item = map.get(key)!;
    item.productIds.add(s.productId);
    item.serviceCount += 1;
    item.categories.add(s.category);

    const monthlyCost = calculateMonthlyCost(s.cost, s.billingCycle);
    item.monthlyCostUsd += convertCurrency(monthlyCost, s.currency, 'USD', etbPerUsd);
  }

  const results: ProviderConcentrationStat[] = [];
  const total = Math.max(totalProductsCount, 1);

  for (const [providerName, data] of map.entries()) {
    const productCount = data.productIds.size;
    results.push({
      providerName,
      productCount,
      totalProducts: total,
      percentage: Math.round((productCount / total) * 100),
      serviceCount: data.serviceCount,
      categories: Array.from(data.categories),
      monthlyCostUsd: Math.round(data.monthlyCostUsd * 100) / 100,
    });
  }

  return results.sort((a, b) => b.productCount - a.productCount || b.serviceCount - a.serviceCount);
}

/**
 * Calculates per-category monthly costs in USD and ETB.
 */
export function calculateCategoryBreakdown(
  services: ServiceLink[],
  etbPerUsd: number
): { category: string; costUsd: number; costEtb: number; count: number }[] {
  const map = new Map<string, { costUsd: number; count: number }>();

  for (const s of services) {
    if (s.status === 'cancelled') continue;
    const key = s.category;
    if (!map.has(key)) {
      map.set(key, { costUsd: 0, count: 0 });
    }
    const item = map.get(key)!;
    const monthlyCost = calculateMonthlyCost(s.cost, s.billingCycle);
    item.costUsd += convertCurrency(monthlyCost, s.currency, 'USD', etbPerUsd);
    item.count += 1;
  }

  const result = Array.from(map.entries()).map(([category, val]) => ({
    category,
    costUsd: Math.round(val.costUsd * 100) / 100,
    costEtb: Math.round(val.costUsd * etbPerUsd * 100) / 100,
    count: val.count,
  }));

  return result.sort((a, b) => b.costUsd - a.costUsd);
}
