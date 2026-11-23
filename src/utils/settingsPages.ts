/**
 * Helpers for the Settings pages: the section menu, the security log's labels, one "History" list of
 * security events and changes, and each app's budget for this month. Pure functions, unit-tested.
 */
import type { AuditLogItem, Product } from '../types';
import { budgetUse, type BudgetUse } from './budgets';
import { budgetLine, type BudgetLine } from './portfolio';

/** How each security event reads in the log. */
export const SECURITY_LABELS: Record<string, { icon: string; label: string; warn?: boolean }> = {
  sign_in: { icon: '🔐', label: 'Sign-in' },
  unlock: { icon: '🔓', label: 'Unlocked' },
  unlock_failed: { icon: '🚫', label: 'Failed unlock', warn: true },
  export: { icon: '📤', label: 'Export' },
  mfa_enabled: { icon: '✅', label: '2FA turned on' },
  mfa_disabled: { icon: '⚠️', label: '2FA turned off', warn: true },
  mfa_device_added: { icon: '📱', label: '2FA device added' },
  mfa_device_removed: { icon: '📱', label: '2FA device removed', warn: true },
  passkey_added: { icon: '🔑', label: 'Passkey added' },
  passkey_removed: { icon: '🔑', label: 'Passkey removed', warn: true },
  telegram_linked: { icon: '✈️', label: 'Telegram' },
};

/** A row of the security log, as read from audit_logs. */
export interface SecurityEventRow {
  id: string;
  action: string;
  details: string;
  changed_by: string;
  timestamp: string;
}

export interface SettingsSection {
  id: string;
  label: string;
}

/** The cards of the Timeline Settings page, in order (the menu on the left scrolls to them). */
export function settingsSections(demo: boolean): SettingsSection[] {
  return [
    { id: 'settings-workspace', label: 'Workspace' },
    { id: 'settings-money', label: 'Money & rate' },
    { id: 'settings-reminders', label: 'Reminders' },
    { id: 'telegram-settings', label: 'Telegram' },
    { id: 'settings-email', label: 'Email & timing' },
    { id: 'settings-look', label: 'Look' },
    { id: 'settings-security', label: 'Account & security' },
    ...(demo ? [] : [{ id: 'settings-status', label: 'Status' }]),
    { id: 'settings-history', label: 'History' },
    ...(demo ? [{ id: 'settings-demo', label: 'Demo data' }] : []),
  ];
}

export interface HistoryEntry {
  id: string;
  at: string;
  /** Emoji for security events. */
  icon?: string;
  /** "Sign-in" or "[update]". */
  label: string;
  details: string;
  /** warn: worth a look (failed unlock, 2FA off); ok: other security events; date: changes. */
  tone: 'ok' | 'warn' | 'date';
  viaTelegram?: boolean;
}

/**
 * Security events and workspace changes in one list, newest first. The same event can come from both
 * lists (the workspace log holds security events too): it is shown once.
 */
export function historyEntries(
  security: SecurityEventRow[],
  audit: Pick<AuditLogItem, 'id' | 'action' | 'details' | 'timestamp' | 'changedBy'>[],
  limit = 30
): HistoryEntry[] {
  const seen = new Set<string>();
  const out: HistoryEntry[] = [];
  const rows = [
    ...security.map((r) => ({ id: r.id, action: r.action, details: r.details, at: r.timestamp, by: r.changed_by })),
    ...audit.map((r) => ({ id: r.id, action: r.action as string, details: r.details, at: r.timestamp, by: r.changedBy })),
  ];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const meta = SECURITY_LABELS[r.action];
    out.push(
      meta
        ? { id: r.id, at: r.at, icon: meta.icon, label: meta.label, details: r.details, tone: meta.warn ? 'warn' : 'ok', viaTelegram: r.by === 'telegram' }
        : { id: r.id, at: r.at, label: `[${r.action}]`, details: r.details, tone: 'date' }
    );
  }
  const time = (iso: string) => Date.parse(iso) || 0;
  return out.sort((a, b) => time(b.at) - time(a.at)).slice(0, limit);
}

/** "Today 08:12", "Nov 22 21:40", or "Dec 30, 2025 09:00" for another year. */
export function historyTime(iso: string, now: Date, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = (x: Date) => x.toLocaleDateString('en-CA', { timeZone });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone });
  if (day(d) === day(now)) return `Today ${time}`;
  const sameYear = day(d).slice(0, 4) === day(now).slice(0, 4);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }), timeZone });
  return `${date} ${time}`;
}

export interface AppBudgetRow {
  product: Pick<Product, 'id' | 'name' | 'monthlyBudget'>;
  /** USD paid this month. */
  spent: number;
  use: BudgetUse | null;
  line: BudgetLine;
}

/** Each app's monthly budget against what was paid this month (see paidByAppInMonth). */
export function appBudgetRows(products: Pick<Product, 'id' | 'name' | 'monthlyBudget'>[], paid: Map<string, number>): AppBudgetRow[] {
  return products.map((product) => {
    const spent = paid.get(product.id) ?? 0;
    const use = budgetUse(product.monthlyBudget, spent);
    return { product, spent, use, line: budgetLine(use) };
  });
}
