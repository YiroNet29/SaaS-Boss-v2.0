import { ServiceLink, ImportantDate, Product, Currency } from '../types';

export interface DomainExpiryItem {
  id: string;
  domainName: string;
  provider: string;
  productName: string;
  productId?: string;
  serviceLinkId?: string;
  dateId?: string;
  dueDate: string; // YYYY-MM-DD
  autoRenew: boolean;
  cost?: number;
  currency?: Currency;
  loginUrl?: string;
  notes?: string;
  environment?: string;
}

export type DomainUrgency = 'critical' | 'warning' | 'notice' | 'safe';

export interface CountdownTime {
  totalMs: number;
  isOverdue: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  formattedString: string;
  urgency: DomainUrgency;
  urgencyLabel: string;
}

/**
 * Extracts a likely domain name from text, notes, plan, or URLs.
 */
export function extractDomainFromText(text: string): string | null {
  if (!text) return null;
  // Match standard domains like minimart.et, pharmaflow.io, example.com, my-app.co.uk
  const domainRegex = /\b([a-zA-Z0-9][-a-zA-Z0-9]*\.)+(com|io|et|org|net|app|dev|co|ai|cloud|xyz|tech|info|me|uk|us)\b/i;
  const match = text.match(domainRegex);
  if (!match) return null;
  let domain = match[0].toLowerCase();

  // If domain has 3 or more parts, strip known subdomains (pos, app, stage, dev, www, api) to get registered root domain
  const parts = domain.split('.');
  if (parts.length > 2) {
    const commonSubdomains = ['app', 'pos', 'dev', 'stage', 'staging', 'api', 'admin', 'www', 'dash', 'portal', 'mail', 'auth'];
    if (commonSubdomains.includes(parts[0])) {
      domain = parts.slice(1).join('.');
    }
  }
  return domain;
}

/**
 * Normalizes date to end-of-day UTC timestamp for accurate countdown.
 */
function parseTargetTimestamp(dateStr: string): number {
  if (!dateStr) return 0;
  // If only YYYY-MM-DD, set to 23:59:59 UTC
  if (dateStr.length === 10) {
    return new Date(`${dateStr}T23:59:59Z`).getTime();
  }
  return new Date(dateStr).getTime();
}

/**
 * Calculates live ticking countdown for a domain due date.
 */
export function calculateDomainCountdown(
  dueDateStr: string,
  refDate: Date = new Date()
): CountdownTime {
  const targetMs = parseTargetTimestamp(dueDateStr);
  const nowMs = refDate.getTime();
  const diffMs = targetMs - nowMs;
  const isOverdue = diffMs < 0;

  const absDiff = Math.abs(diffMs);
  const totalSeconds = Math.floor(absDiff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let urgency: DomainUrgency = 'safe';
  let urgencyLabel = 'Active & Secure';

  if (isOverdue) {
    urgency = 'critical';
    urgencyLabel = 'Expired (Grace Period Active)';
  } else if (days <= 7) {
    urgency = 'critical';
    urgencyLabel = days === 0 ? 'Expiring Today' : `Expiring in ${days}d (Action Required)`;
  } else if (days <= 30) {
    urgency = 'warning';
    urgencyLabel = `Expiring in ${days} days`;
  } else if (days <= 60) {
    urgency = 'notice';
    urgencyLabel = `Expiring in ${days} days`;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const timeFormatted = `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  const formattedString = isOverdue
    ? `Overdue by ${timeFormatted}`
    : `${timeFormatted} remaining`;

  return {
    totalMs: diffMs,
    isOverdue,
    days,
    hours,
    minutes,
    seconds,
    formattedString,
    urgency,
    urgencyLabel,
  };
}

/**
 * Finds and aggregates all domain registry items from services and important dates.
 */
export function extractDomainItems(
  services: ServiceLink[],
  dates: ImportantDate[],
  products: Product[]
): DomainExpiryItem[] {
  const prodMap = new Map<string, string>();
  const prodLiveUrlMap = new Map<string, string>();
  for (const p of products) {
    prodMap.set(p.id, p.name);
    if (p.liveUrl) prodLiveUrlMap.set(p.id, p.liveUrl);
  }

  const domainItems: DomainExpiryItem[] = [];
  const processedServiceIds = new Set<string>();

  // 1. Process explicit ImportantDates where type is 'domain expiry' or title mentions domain
  for (const d of dates) {
    const isDomainDate =
      d.type === 'domain expiry' ||
      d.title.toLowerCase().includes('domain') ||
      d.title.toLowerCase().includes('registrar');

    if (!isDomainDate) continue;

    const linkedService = d.serviceLinkId
      ? services.find((s) => s.id === d.serviceLinkId)
      : undefined;

    if (linkedService) {
      processedServiceIds.add(linkedService.id);
    }

    // Try extracting domain name from title, notes, linked service, or product
    const candidateText = `${d.title} ${d.notes || ''} ${linkedService?.notes || ''} ${linkedService?.plan || ''}`;
    let domainName = extractDomainFromText(candidateText);

    if (!domainName && d.productId && prodLiveUrlMap.has(d.productId)) {
      domainName = extractDomainFromText(prodLiveUrlMap.get(d.productId) || '');
    }

    if (!domainName) {
      domainName = d.title.replace(/domain|expiry|expiration|renew|grace period/gi, '').trim() || 'Custom Domain';
    }

    domainItems.push({
      id: `domain-date-${d.id}`,
      domainName,
      provider: linkedService?.providerName || 'Domain Registrar',
      productName: (d.productId ? prodMap.get(d.productId) : undefined) || 'General Stack',
      productId: d.productId || linkedService?.productId,
      serviceLinkId: linkedService?.id,
      dateId: d.id,
      dueDate: d.dueDate || linkedService?.renewalDate || '',
      autoRenew: linkedService ? linkedService.autoRenew : false,
      cost: linkedService?.cost,
      currency: linkedService?.currency,
      loginUrl: linkedService?.loginUrl,
      notes: d.notes || linkedService?.notes,
      environment: linkedService?.environmentType || 'production',
    });
  }

  // 2. Process services where category is 'domain registrar' or provider is a registrar that wasn't already linked
  for (const s of services) {
    if (processedServiceIds.has(s.id)) continue;

    const isRegistrar =
      s.category === 'domain registrar' ||
      s.providerName.toLowerCase().includes('domain') ||
      s.providerName.toLowerCase().includes('namecheap') ||
      s.providerName.toLowerCase().includes('godaddy') ||
      s.providerName.toLowerCase().includes('porkbun');

    if (!isRegistrar || !s.renewalDate) continue;

    // Extract domain from notes, plan, loginUrl, or product liveUrl
    const candidateText = `${s.notes} ${s.plan} ${s.loginUrl}`;
    let domainName = extractDomainFromText(candidateText);

    if (!domainName && s.productId && prodLiveUrlMap.has(s.productId)) {
      domainName = extractDomainFromText(prodLiveUrlMap.get(s.productId) || '');
    }

    if (!domainName) {
      domainName = `${s.providerName} Domain`;
    }

    domainItems.push({
      id: `domain-service-${s.id}`,
      domainName,
      provider: s.providerName,
      productName: prodMap.get(s.productId) || 'General Stack',
      productId: s.productId,
      serviceLinkId: s.id,
      dueDate: s.renewalDate,
      autoRenew: s.autoRenew,
      cost: s.cost,
      currency: s.currency,
      loginUrl: s.loginUrl,
      notes: s.notes,
      environment: s.environmentType,
    });
  }

  // Sort by urgency: overdue first, then closest due date
  return domainItems.sort((a, b) => {
    return parseTargetTimestamp(a.dueDate) - parseTargetTimestamp(b.dueDate);
  });
}

/**
 * Calculates new date advanced by exactly 1 year (YYYY-MM-DD).
 */
export function advanceDomainYear(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    return nextYear.toISOString().slice(0, 10);
  }
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10) + 1;
    return `${year}-${parts[1]}-${parts[2]}`;
  }
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}
