import { ServiceLink, ImportantDate, Product, Currency } from '../types';
import { detectSecretInText } from './secrets';
import { ProviderConcentrationStat } from './cost';
import { getDaysDiff } from './reminders';

export interface HealthCheckItem {
  id: string;
  name: string;
  category: 'security' | 'renewals' | 'resilience' | 'operations';
  score: number;
  maxScore: number;
  status: 'optimal' | 'warning' | 'critical';
  summary: string;
  detail: string;
  actionLabel?: string;
}

export interface StackHealthReport {
  score: number; // 0 to 100
  grade: 'A+' | 'A' | 'B' | 'C' | 'Action Needed';
  checks: HealthCheckItem[];
  recommendations: string[];
  autoRenewingCount: number;
  trialExpiringCount: number;
  unprotectedSecretsCount: number;
}

export interface MonthlyCashflowForecast {
  monthKey: string;
  monthLabel: string;
  totalUsd: number;
  totalEtb: number;
  renewalCount: number;
  topRenewals: { serviceName: string; costUsd: number }[];
}

export function calculateStackHealth(
  services: ServiceLink[],
  dates: ImportantDate[],
  products: Product[],
  providerConcentrations: ProviderConcentrationStat[]
): StackHealthReport {
  const checks: HealthCheckItem[] = [];
  const recommendations: string[] = [];

  // Check 1: Zero Secret Leak Guarantee (25 pts)
  let secretLeakedCount = 0;
  for (const s of services) {
    if (detectSecretInText(s.notes || '').hasSecret || detectSecretInText(s.loginUrl || '').hasSecret) {
      secretLeakedCount++;
    }
  }
  for (const d of dates) {
    if (detectSecretInText(d.notes || '').hasSecret || detectSecretInText(d.title || '').hasSecret) {
      secretLeakedCount++;
    }
  }

  const secretScore = secretLeakedCount === 0 ? 25 : Math.max(0, 25 - secretLeakedCount * 10);
  checks.push({
    id: 'secret-shield',
    name: 'Vault Reference Shield',
    category: 'security',
    score: secretScore,
    maxScore: 25,
    status: secretScore === 25 ? 'optimal' : 'critical',
    summary: secretLeakedCount === 0 ? 'No plaintext credentials detected' : `${secretLeakedCount} item(s) may contain raw API keys`,
    detail: 'All secrets must reside exclusively in your external Vault, referenced by Vault ID.',
    actionLabel: secretScore < 25 ? 'Sanitize Secrets' : undefined,
  });
  if (secretLeakedCount > 0) {
    recommendations.push('Move exposed tokens/passwords to Vault and store only reference IDs.');
  }

  // Check 2: Auto-Renew & Unexpected Charge Guard (25 pts)
  const autoRenewing = services.filter((s) => s.autoRenew && s.status === 'active');
  const autoRenewWithoutDate = autoRenewing.filter((s) => !s.renewalDate);
  const autoRenewScore = autoRenewWithoutDate.length === 0 ? 25 : Math.max(5, 25 - autoRenewWithoutDate.length * 5);
  checks.push({
    id: 'auto-renew-guard',
    name: 'Auto-Renew Tracking',
    category: 'renewals',
    score: autoRenewScore,
    maxScore: 25,
    status: autoRenewScore === 25 ? 'optimal' : autoRenewScore >= 18 ? 'warning' : 'critical',
    summary: `${autoRenewing.length} active auto-renew subscriptions (${autoRenewWithoutDate.length} missing exact date)`,
    detail: 'Prevents surprise credit card charges by ensuring every auto-renewing service has a verified renewal date.',
    actionLabel: autoRenewWithoutDate.length > 0 ? 'Add Renewal Dates' : undefined,
  });
  if (autoRenewWithoutDate.length > 0) {
    recommendations.push(`Set exact renewal dates for ${autoRenewWithoutDate.length} auto-renewing service(s) to avoid unannounced charges.`);
  }

  // Check 3: Provider Concentration & Outage Blast Radius (25 pts)
  const highestShare = providerConcentrations.length > 0 ? providerConcentrations[0].percentage : 0;
  let concentrationScore = 25;
  let concentrationStatus: 'optimal' | 'warning' | 'critical' = 'optimal';
  if (highestShare > 60 && products.length > 1) {
    concentrationScore = 12;
    concentrationStatus = 'critical';
    recommendations.push(`High provider dependence: "${providerConcentrations[0].providerName}" powers ${highestShare}% of your stacks.`);
  } else if (highestShare > 40 && products.length > 1) {
    concentrationScore = 18;
    concentrationStatus = 'warning';
    recommendations.push(`Consider multi-cloud or fallback options for "${providerConcentrations[0].providerName}" (${highestShare}% stack share).`);
  }

  checks.push({
    id: 'provider-concentration',
    name: 'Provider Concentration Risk',
    category: 'resilience',
    score: concentrationScore,
    maxScore: 25,
    status: concentrationStatus,
    summary: providerConcentrations.length > 0
      ? `Top provider: ${providerConcentrations[0].providerName} (${highestShare}% of products)`
      : 'No services registered',
    detail: 'Limits systemic outage impact if a single cloud provider encounters downtime.',
  });

  // Check 4: Trial Expirations & Overdue Deadlines (25 pts)
  const today = new Date().toISOString().slice(0, 10);
  const overdueDates = dates.filter((d) => d.status === 'open' && d.dueDate < today).length;
  const overdueRenewals = services.filter((s) => s.status === 'active' && s.renewalDate && s.renewalDate < today).length;
  const totalOverdue = overdueDates + overdueRenewals;

  const trialsExpiringSoon = services.filter((s) => {
    if (s.status !== 'trial' || !s.trialEndsAt) return false;
    const diff = getDaysDiff(today, s.trialEndsAt);
    return diff >= 0 && diff <= 14;
  }).length;

  let opsScore = 25;
  if (totalOverdue > 0) opsScore -= Math.min(15, totalOverdue * 5);
  if (trialsExpiringSoon > 0) opsScore -= Math.min(10, trialsExpiringSoon * 3);
  opsScore = Math.max(0, opsScore);

  checks.push({
    id: 'trial-deadline-hygiene',
    name: 'Milestone & Trial Hygiene',
    category: 'operations',
    score: opsScore,
    maxScore: 25,
    status: opsScore >= 22 ? 'optimal' : opsScore >= 14 ? 'warning' : 'critical',
    summary: `${totalOverdue} overdue item(s) • ${trialsExpiringSoon} trial(s) ending within 14d`,
    detail: 'Ensures free trials do not silently convert into unwanted paid plans and domain renewals are never missed.',
    actionLabel: totalOverdue > 0 ? 'Clear Overdue Items' : undefined,
  });
  if (totalOverdue > 0) {
    recommendations.push(`Resolve or snooze ${totalOverdue} overdue renewal(s) or milestone(s).`);
  }
  if (trialsExpiringSoon > 0) {
    recommendations.push(`Evaluate ${trialsExpiringSoon} trial subscription(s) expiring within 14 days.`);
  }

  // Calculate overall score
  const totalScore = Math.round(checks.reduce((acc, c) => acc + c.score, 0));
  let grade: StackHealthReport['grade'] = 'Action Needed';
  if (totalScore >= 95) grade = 'A+';
  else if (totalScore >= 85) grade = 'A';
  else if (totalScore >= 70) grade = 'B';
  else if (totalScore >= 50) grade = 'C';

  return {
    score: totalScore,
    grade,
    checks,
    recommendations,
    autoRenewingCount: autoRenewing.length,
    trialExpiringCount: trialsExpiringSoon,
    unprotectedSecretsCount: secretLeakedCount,
  };
}

export function calculateMonthlyCashflowForecast(
  services: ServiceLink[],
  _baseCurrency: Currency,
  etbPerUsd: number,
  monthsAhead: number = 12
): MonthlyCashflowForecast[] {
  const result: MonthlyCashflowForecast[] = [];
  const now = new Date();

  for (let i = 0; i < monthsAhead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0 to 11
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    let totalUsd = 0;
    let renewalCount = 0;
    const renewals: { serviceName: string; costUsd: number }[] = [];

    for (const s of services) {
      if (s.status === 'cancelled' || s.billingCycle === 'free') continue;

      const costInUsd = s.currency === 'USD' ? s.cost : s.cost / (etbPerUsd || 130);

      if (s.billingCycle === 'monthly') {
        totalUsd += costInUsd;
        renewalCount++;
        renewals.push({ serviceName: s.providerName, costUsd: costInUsd });
      } else if (s.billingCycle === 'yearly' && s.renewalDate) {
        const renDate = new Date(s.renewalDate);
        if (renDate.getMonth() === month) {
          totalUsd += costInUsd;
          renewalCount++;
          renewals.push({ serviceName: `${s.providerName} (Annual)`, costUsd: costInUsd });
        }
      } else if (s.billingCycle === 'yearly' && !s.renewalDate) {
        // Amortized fallback if no exact date
        totalUsd += costInUsd / 12;
      }
    }

    renewals.sort((a, b) => b.costUsd - a.costUsd);

    result.push({
      monthKey,
      monthLabel,
      totalUsd: Math.round(totalUsd * 100) / 100,
      totalEtb: Math.round(totalUsd * (etbPerUsd || 130)),
      renewalCount,
      topRenewals: renewals.slice(0, 3),
    });
  }

  return result;
}
