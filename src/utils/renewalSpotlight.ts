import { ServiceLink, Product } from '../types';

export type RenewalStatusLevel = 'overdue' | 'imminent' | 'upcoming' | 'normal';

export interface RenewalSpotlightItem {
  service: ServiceLink;
  productName: string;
  productId: string;
  effectiveDate: string; // The date triggering the spotlight (renewalDate or trialEndsAt)
  dateType: 'renewal' | 'trial';
  daysRemaining: number;
  statusLevel: RenewalStatusLevel;
  statusLabel: string;
  isHighImpact: boolean; // e.g. yearly large payment or cost > $40/mo or autoRenew with high cost
  costInUsd: number;
  priorityScore: number;
}

export interface RenewalSpotlightSummary {
  items: RenewalSpotlightItem[];
  totalExpiringCount: number;
  imminentCount: number; // <= 7 days or overdue
  trialCount: number;
  totalExposureUsd: number;
  autoRenewCount: number;
}

/**
 * Calculates calendar days difference between a date string and reference date.
 */
export function calculateDaysRemaining(dateStr: string, refDate = new Date()): number {
  if (!dateStr) return 999;
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) return 999;

  // Use midnight UTC comparison to avoid daylight savings quirks
  const targetMidnight = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const refMidnight = Date.UTC(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());

  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((targetMidnight - refMidnight) / msPerDay);
}

/**
 * Determines urgency classification and badges for spotlight items.
 */
export function getRenewalUrgency(
  daysRemaining: number,
  isTrial: boolean,
  isAutoRenew: boolean,
  costUsd: number
): {
  level: RenewalStatusLevel;
  label: string;
  colorClass: {
    bg: string;
    text: string;
    border: string;
    dot: string;
    badge: string;
  };
} {
  if (daysRemaining < 0) {
    const overdueDays = Math.abs(daysRemaining);
    return {
      level: 'overdue',
      label: overdueDays === 1 ? 'Overdue by 1 day' : `Overdue by ${overdueDays} days`,
      colorClass: {
        bg: 'bg-rose-500/10 dark:bg-rose-950/30',
        text: 'text-rose-600 dark:text-rose-400',
        border: 'border-rose-300 dark:border-rose-900/40',
        dot: 'bg-rose-500',
        badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-900/40',
      },
    };
  }

  if (daysRemaining === 0) {
    return {
      level: 'imminent',
      label: isTrial ? 'Trial Ends Today' : 'Renews Today',
      colorClass: {
        bg: 'bg-rose-500/10 dark:bg-rose-950/30',
        text: 'text-rose-600 dark:text-rose-400',
        border: 'border-rose-300 dark:border-rose-900/40',
        dot: 'bg-rose-500',
        badge: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-900/40',
      },
    };
  }

  if (daysRemaining <= 7 || (isTrial && daysRemaining <= 10)) {
    return {
      level: 'imminent',
      label: daysRemaining === 1 ? 'Tomorrow' : `In ${daysRemaining} days`,
      colorClass: {
        bg: 'bg-amber-500/10 dark:bg-amber-950/30',
        text: 'text-amber-700 dark:text-amber-400',
        border: 'border-amber-300 dark:border-amber-900/40',
        dot: 'bg-amber-500',
        badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-900/40',
      },
    };
  }

  if (daysRemaining <= 14) {
    return {
      level: 'upcoming',
      label: `In ${daysRemaining} days`,
      colorClass: {
        bg: 'bg-indigo-500/10 dark:bg-indigo-950/30',
        text: 'text-indigo-700 dark:text-indigo-400',
        border: 'border-indigo-300 dark:border-indigo-900/40',
        dot: 'bg-indigo-500',
        badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/40',
      },
    };
  }

  return {
    level: 'normal',
    label: `In ${daysRemaining} days`,
    colorClass: {
      bg: 'bg-emerald-500/10 dark:bg-emerald-950/30',
      text: 'text-emerald-700 dark:text-emerald-400',
      border: 'border-emerald-300 dark:border-emerald-900/40',
      dot: 'bg-emerald-500',
      badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40',
    },
  };
}

/**
 * Filters and ranks services expiring in the next 30 days.
 */
export function getExpiringServices(
  services: ServiceLink[],
  products: Product[],
  options?: {
    daysThreshold?: number; // default 30 days
    refDate?: Date;
    exchangeRateEtbPerUsd?: number;
    filter?: 'all' | 'trials' | 'high_impact' | 'overdue';
  }
): RenewalSpotlightSummary {
  const threshold = options?.daysThreshold ?? 30;
  const refDate = options?.refDate ?? new Date();
  const rate = options?.exchangeRateEtbPerUsd || 130;
  const filter = options?.filter || 'all';

  const productMap = new Map<string, string>();
  for (const p of products) {
    productMap.set(p.id, p.name);
  }

  const items: RenewalSpotlightItem[] = [];

  for (const s of services) {
    if (s.status === 'cancelled') continue;

    // Pick most urgent date: trialEndsAt if on trial or has trial date, else renewalDate
    let chosenDate: string | undefined = undefined;
    let dateType: 'renewal' | 'trial' = 'renewal';

    if (s.status === 'trial' && s.trialEndsAt) {
      chosenDate = s.trialEndsAt;
      dateType = 'trial';
    } else if (s.renewalDate) {
      chosenDate = s.renewalDate;
      dateType = 'renewal';
    } else if (s.trialEndsAt) {
      chosenDate = s.trialEndsAt;
      dateType = 'trial';
    }

    if (!chosenDate) continue;

    const daysRemaining = calculateDaysRemaining(chosenDate, refDate);

    // Keep items expiring in next threshold days, or overdue up to 30 days past
    if (daysRemaining > threshold || daysRemaining < -30) continue;

    // Convert cost to USD equivalent
    const rawCost = s.cost || 0;
    const costUsd = s.currency === 'ETB' ? rawCost / rate : rawCost;

    const isHighImpact =
      costUsd >= 35 ||
      s.billingCycle === 'yearly' ||
      (s.autoRenew && costUsd >= 20) ||
      (dateType === 'trial' && daysRemaining <= 5);

    const urgency = getRenewalUrgency(daysRemaining, dateType === 'trial', s.autoRenew, costUsd);

    // Filter check
    if (filter === 'trials' && dateType !== 'trial') continue;
    if (filter === 'high_impact' && !isHighImpact) continue;
    if (filter === 'overdue' && daysRemaining >= 0) continue;

    // Priority scoring formula:
    // Higher score = higher priority in the list
    // Overdue: base 1000 + overdue days * 20
    // Imminent (0-7d): base 500 + (7 - days) * 40
    // Upcoming (8-14d): base 200 + (14 - days) * 15
    // Normal (15-30d): base 50 + (30 - days) * 5
    // Add bonus for high impact (+150), trial ending (+200), auto-renew on (+50)
    let priorityScore = 0;
    if (daysRemaining < 0) {
      priorityScore = 1000 + Math.abs(daysRemaining) * 20;
    } else if (daysRemaining <= 7) {
      priorityScore = 500 + (7 - daysRemaining) * 40;
    } else if (daysRemaining <= 14) {
      priorityScore = 200 + (14 - daysRemaining) * 15;
    } else {
      priorityScore = 50 + (30 - daysRemaining) * 5;
    }

    if (isHighImpact) priorityScore += 150;
    if (dateType === 'trial') priorityScore += 120;
    if (s.autoRenew) priorityScore += 40;

    items.push({
      service: s,
      productName: productMap.get(s.productId) || 'Global / Unassigned',
      productId: s.productId,
      effectiveDate: chosenDate,
      dateType,
      daysRemaining,
      statusLevel: urgency.level,
      statusLabel: urgency.label,
      isHighImpact,
      costInUsd: Math.round(costUsd * 100) / 100,
      priorityScore,
    });
  }

  // Sort descending by priorityScore
  items.sort((a, b) => b.priorityScore - a.priorityScore);

  let totalExposureUsd = 0;
  let imminentCount = 0;
  let trialCount = 0;
  let autoRenewCount = 0;

  for (const item of items) {
    totalExposureUsd += item.costInUsd;
    if (item.daysRemaining <= 7) imminentCount++;
    if (item.dateType === 'trial') trialCount++;
    if (item.service.autoRenew) autoRenewCount++;
  }

  return {
    items,
    totalExpiringCount: items.length,
    imminentCount,
    trialCount,
    totalExposureUsd: Math.round(totalExposureUsd * 100) / 100,
    autoRenewCount,
  };
}
