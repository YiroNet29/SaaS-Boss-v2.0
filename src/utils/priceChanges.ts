import type { Payment, ServiceLink } from '../types';

export interface PriceChange {
  serviceId: string;
  listed: number;
  charged: number;
  currency: Payment['currency'];
  paidOn: string;
}

/**
 * Services whose most recent payment (in the service's own currency) differs from the listed price by
 * more than 2% and more than 0.50: the provider probably changed its price, or the plan changed.
 */
export function priceChanges(services: ServiceLink[], payments: Payment[]): Map<string, PriceChange> {
  const latest = new Map<string, Payment>();
  for (const p of payments) {
    if (!p.serviceLinkId) continue;
    const cur = latest.get(p.serviceLinkId);
    if (!cur || p.paidOn > cur.paidOn || (p.paidOn === cur.paidOn && p.createdAt > cur.createdAt)) latest.set(p.serviceLinkId, p);
  }
  const out = new Map<string, PriceChange>();
  for (const s of services) {
    if (s.status === 'cancelled' || !(s.cost > 0)) continue;
    if (s.billingCycle === 'usage-based' || s.billingCycle === 'free' || s.billingCycle === 'one-time') continue;
    const p = latest.get(s.id);
    if (!p || p.currency !== s.currency) continue;
    const diff = Math.abs(p.amount - s.cost);
    if (diff > 0.5 && diff / s.cost > 0.02) {
      out.set(s.id, { serviceId: s.id, listed: s.cost, charged: p.amount, currency: p.currency, paidOn: p.paidOn });
    }
  }
  return out;
}
