/**
 * Pure helpers for the server reminder job (no I/O, unit-tested).
 */
import type { Currency, ImportantDate, ReminderLog, ServiceLink } from '../types';
import { evaluateReminder, getDaysDiff, type ReminderCandidate } from './reminders';
import { formatCurrency } from './formatters';

export interface DueCandidate extends ReminderCandidate {
  productName: string;
  amount?: number;
  currency?: Currency;
}

export interface DueAlert extends DueCandidate {
  daysDiff: number;
  leadDay: number;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Local calendar date (YYYY-MM-DD) and hour (0-23) for an IANA timezone. */
export function localDateAndHour(now: Date, timeZone: string): { date: string; hour: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    // Unknown timezone string: fall back to UTC instead of failing the whole run.
    return localDateAndHour(now, 'UTC');
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 };
}

/** Everything in a workspace that can trigger a reminder. */
export function buildCandidates(
  dates: ImportantDate[],
  services: ServiceLink[],
  productNames: Map<string, string>,
  defaultLeadDays: number[]
): DueCandidate[] {
  const out: DueCandidate[] = [];

  for (const d of dates) {
    if (d.status === 'done') continue;
    const due = d.snoozedUntil || d.dueDate;
    if (!due) continue;
    out.push({
      itemId: d.id,
      itemType: 'importantDate',
      title: d.title,
      dueDate: due,
      leadDays: d.leadDays?.length ? d.leadDays : defaultLeadDays,
      productName: (d.productId && productNames.get(d.productId)) || 'Global',
    });
  }

  for (const s of services) {
    const productName = productNames.get(s.productId) || 'Product';
    if ((s.status === 'active' || s.status === 'trial') && s.renewalDate) {
      out.push({
        itemId: s.id,
        itemType: 'serviceLink',
        title: `${s.providerName} renewal (${s.plan || s.billingCycle})`,
        dueDate: s.renewalDate,
        leadDays: defaultLeadDays,
        productName,
        amount: s.cost,
        currency: s.currency,
      });
    }
    if (s.status === 'trial' && s.trialEndsAt) {
      out.push({
        itemId: `${s.id}:trial`,
        itemType: 'serviceLink',
        title: `${s.providerName} free trial ends`,
        dueDate: s.trialEndsAt,
        leadDays: defaultLeadDays,
        productName,
      });
    }
  }

  return out;
}

/** Which candidates should be sent today on a channel, given what was already sent. */
export function selectAlerts(
  candidates: DueCandidate[],
  today: string,
  logs: ReminderLog[],
  channel: 'email' | 'telegram'
): DueAlert[] {
  const alerts: DueAlert[] = [];
  for (const c of candidates) {
    // Only count logs from this renewal cycle. Without this, a yearly renewal that was
    // reminded at "30 days" last year would never be reminded at "30 days" again.
    const cycleStart = shiftDate(c.dueDate, -(Math.max(0, ...c.leadDays) + 1));
    const cycleLogs = logs.filter((l) => l.itemId === c.itemId && l.sentAt.slice(0, 10) >= cycleStart);
    const decision = evaluateReminder(c, today, cycleLogs, channel);
    if (decision.shouldSend) {
      alerts.push({ ...c, daysDiff: decision.daysDiff, leadDay: decision.matchedLeadDay ?? decision.daysDiff });
    }
  }
  return alerts.sort((a, b) => a.daysDiff - b.daysDiff);
}

/** Items due within `days` (plus anything overdue), for the Telegram /due and /week commands. */
export function itemsDueWithin(candidates: DueCandidate[], today: string, days: number) {
  return candidates
    .map((c) => ({ ...c, daysDiff: getDaysDiff(today, c.dueDate) }))
    .filter((c) => c.daysDiff <= days)
    .sort((a, b) => a.daysDiff - b.daysDiff);
}

export function describeDays(daysDiff: number): string {
  if (daysDiff === 0) return 'due today';
  if (daysDiff === 1) return 'due tomorrow';
  if (daysDiff > 0) return `in ${daysDiff} days`;
  if (daysDiff === -1) return '1 day overdue';
  return `${-daysDiff} days overdue`;
}

export function formatAlertLine(a: { title: string; productName: string; daysDiff: number; dueDate: string; amount?: number; currency?: Currency }): string {
  const cost = a.amount && a.currency ? ` · ${formatCurrency(a.amount, a.currency)}` : '';
  return `${a.title} [${a.productName}] - ${describeDays(a.daysDiff)} (${a.dueDate})${cost}`;
}

export function buildDigestText(workspaceName: string, alerts: DueAlert[], appUrl?: string): string {
  const lines = [`StackTrack - ${workspaceName}`, `${alerts.length} item(s) need attention:`, ''];
  for (const a of alerts) lines.push(`• ${formatAlertLine(a)}`);
  if (appUrl) lines.push('', `Open StackTrack: ${appUrl}`);
  return lines.join('\n');
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildDigestHtml(workspaceName: string, alerts: DueAlert[], appUrl?: string): string {
  const rows = alerts
    .map((a) => {
      const color = a.daysDiff < 0 ? '#e11d48' : a.daysDiff <= 7 ? '#d97706' : '#334155';
      return `<li style="margin:0 0 8px"><strong>${escapeHtml(a.title)}</strong> <span style="color:#64748b">[${escapeHtml(
        a.productName
      )}]</span><br><span style="color:${color}">${describeDays(a.daysDiff)}</span> · ${a.dueDate}${
        a.amount && a.currency ? ` · ${escapeHtml(formatCurrency(a.amount, a.currency))}` : ''
      }</li>`;
    })
    .join('');
  const link = appUrl ? `<p><a href="${escapeHtml(appUrl)}">Open StackTrack</a></p>` : '';
  return `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#0f172a"><h2 style="margin:0 0 12px">${escapeHtml(
    workspaceName
  )}: ${alerts.length} item(s) need attention</h2><ul style="padding-left:18px">${rows}</ul>${link}</div>`;
}
