import { ServiceLink } from '../types';

export interface MonthlySpendPoint {
  monthKey: string; // 'YYYY-MM'
  monthLabel: string; // 'May 2026'
  shortLabel: string; // 'May'
  totalUsd: number;
  totalEtb: number;
  servicesCount: number;
  newServicesCount: number;
  categoryBreakdown: Record<string, number>;
  topCategory: string;
}

export interface SpendTrendSummary {
  points: MonthlySpendPoint[];
  currentMonthlyUsd: number;
  startMonthlyUsd: number;
  netChangeUsd: number;
  growthPercentage: number;
  averageMonthlyUsd: number;
  total6MonthSpendUsd: number;
  peakMonth: {
    monthLabel: string;
    shortLabel: string;
    amountUsd: number;
  };
}

/**
 * Calculates historical stack spend across the last 6 calendar months.
 * Determines service presence in each month based on createdAt and status.
 */
export function calculate6MonthSpendTrend(
  services: ServiceLink[],
  options?: {
    refDate?: Date;
    exchangeRateEtbPerUsd?: number;
  }
): SpendTrendSummary {
  const refDate = options?.refDate ?? new Date();
  const rate = options?.exchangeRateEtbPerUsd || 130;

  // Generate last 6 months (oldest to newest)
  const monthDates: Date[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(refDate.getFullYear(), refDate.getMonth() - i, 1);
    monthDates.push(d);
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fullMonthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const points: MonthlySpendPoint[] = [];

  for (const mDate of monthDates) {
    const year = mDate.getFullYear();
    const month = mDate.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const shortLabel = monthNames[month];
    const monthLabel = `${fullMonthNames[month]} ${year}`;

    // Month boundary: end of this month (23:59:59.999)
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const monthStart = new Date(year, month, 1, 0, 0, 0, 0);

    let totalUsd = 0;
    let servicesCount = 0;
    let newServicesCount = 0;
    const catSpend: Record<string, number> = {};

    for (const s of services) {
      if (s.status === 'cancelled') continue;

      // Check if service was created on or before this month
      let isServiceActiveInMonth = true;
      if (s.createdAt) {
        const createdDate = new Date(s.createdAt);
        if (!isNaN(createdDate.getTime())) {
          // If created after this month, it wasn't in stack yet
          if (createdDate > monthEnd) {
            isServiceActiveInMonth = false;
          }
          // Check if newly added this month
          if (createdDate >= monthStart && createdDate <= monthEnd) {
            newServicesCount++;
          }
        }
      }

      if (isServiceActiveInMonth) {
        servicesCount++;

        // Monthly amortized cost
        let monthlyCost = 0;
        if (s.billingCycle === 'monthly') {
          monthlyCost = s.cost || 0;
        } else if (s.billingCycle === 'yearly') {
          monthlyCost = (s.cost || 0) / 12;
        } else if (s.billingCycle === 'usage-based') {
          monthlyCost = s.cost || 0;
        }

        const costInUsd = s.currency === 'ETB' ? monthlyCost / rate : monthlyCost;
        totalUsd += costInUsd;

        const cat = s.category || 'other';
        catSpend[cat] = (catSpend[cat] || 0) + costInUsd;
      }
    }

    // Determine top category
    let topCat = 'None';
    let maxCatSpend = 0;
    for (const [c, val] of Object.entries(catSpend)) {
      if (val > maxCatSpend) {
        maxCatSpend = val;
        topCat = c;
      }
    }

    const roundedUsd = Math.round(totalUsd * 100) / 100;
    const roundedEtb = Math.round(totalUsd * rate * 100) / 100;

    points.push({
      monthKey,
      monthLabel,
      shortLabel,
      totalUsd: roundedUsd,
      totalEtb: roundedEtb,
      servicesCount,
      newServicesCount,
      categoryBreakdown: catSpend,
      topCategory: topCat,
    });
  }

  const startMonthlyUsd = points[0]?.totalUsd ?? 0;
  const currentMonthlyUsd = points[points.length - 1]?.totalUsd ?? 0;
  const netChangeUsd = Math.round((currentMonthlyUsd - startMonthlyUsd) * 100) / 100;

  let growthPercentage = 0;
  if (startMonthlyUsd > 0) {
    growthPercentage = Math.round(((currentMonthlyUsd - startMonthlyUsd) / startMonthlyUsd) * 1000) / 10;
  } else if (currentMonthlyUsd > 0) {
    growthPercentage = 100;
  }

  const total6MonthSpendUsd = Math.round(points.reduce((acc, p) => acc + p.totalUsd, 0) * 100) / 100;
  const averageMonthlyUsd = Math.round((total6MonthSpendUsd / (points.length || 1)) * 100) / 100;

  let peakMonth = {
    monthLabel: points[0]?.monthLabel || 'N/A',
    shortLabel: points[0]?.shortLabel || 'N/A',
    amountUsd: points[0]?.totalUsd || 0,
  };
  for (const p of points) {
    if (p.totalUsd >= peakMonth.amountUsd) {
      peakMonth = {
        monthLabel: p.monthLabel,
        shortLabel: p.shortLabel,
        amountUsd: p.totalUsd,
      };
    }
  }

  return {
    points,
    currentMonthlyUsd,
    startMonthlyUsd,
    netChangeUsd,
    growthPercentage,
    averageMonthlyUsd,
    total6MonthSpendUsd,
    peakMonth,
  };
}
