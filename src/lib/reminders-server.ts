import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fromRow } from './db';
import { buildCandidates, buildDigestHtml, buildDigestText, type DueAlert, type DueCandidate } from '../utils/reminderDigest';
import { buildReminderMessage, escapeHtml } from '../utils/telegramUi';
import type { MoneyAlert } from '../utils/moneyAlerts';
import { buildMonthlyMessage, monthName, summarizeMonth, type MonthlyInput } from '../utils/monthlySummary';
import { sendTelegramMessage } from './telegram';
import { computeRollForwards, describeRollForward } from '../utils/renewals';
import { crossedRenewals, renewalPaymentId } from '../utils/ledger';
import type {
  ImportantDate,
  NotificationSettings,
  Payment,
  PaymentSource,
  Product,
  ServiceLink,
  SourceTransaction,
  Workspace,
} from '../types';

export type SettingsRow = NotificationSettings & { workspaceId: string };

/** Loads everything the reminder logic needs for one workspace (service-role client). */
export async function loadWorkspaceCandidates(admin: SupabaseClient, ws: Workspace): Promise<DueCandidate[]> {
  const [prodRes, srvRes, dateRes] = await Promise.all([
    admin.from('products').select('id,name').eq('workspace_id', ws.id),
    admin.from('service_links').select('*').eq('workspace_id', ws.id).in('status', ['active', 'trial']),
    admin.from('important_dates').select('*').eq('workspace_id', ws.id).in('status', ['open', 'snoozed']),
  ]);
  for (const r of [prodRes, srvRes, dateRes]) if (r.error) throw new Error(r.error.message);

  const names = new Map<string, string>();
  for (const p of (prodRes.data ?? []).map((r) => fromRow<Product>(r))) names.set(p.id, p.name);

  return buildCandidates(
    (dateRes.data ?? []).map((r) => fromRow<ImportantDate>(r)),
    (srvRes.data ?? []).map((r) => fromRow<ServiceLink>(r)),
    names,
    ws.defaultLeadDays?.length ? ws.defaultLeadDays : [30, 14, 7, 1]
  );
}

/**
 * Moves every overdue auto-renewing service to its next renewal date and records an audit entry.
 * Runs at the start of each cron run so reminders never treat an auto-renewed bill as overdue.
 */
export async function rollForwardAutoRenewals(
  admin: SupabaseClient,
  today: string
): Promise<{ moved: number; errors: string[] }> {
  const { data, error } = await admin
    .from('service_links')
    .select('*')
    .eq('auto_renew', true)
    .eq('status', 'active')
    .lt('renewal_date', today);
  if (error) return { moved: 0, errors: [error.message] };

  const services = (data ?? []).map((r) => fromRow<ServiceLink>(r));
  const moves = computeRollForwards(services, today);
  const errors: string[] = [];
  let moved = 0;

  for (const m of moves) {
    // Only update if the date is still the one we read (another run or the app may have moved it).
    const { data: updated, error: upErr } = await admin
      .from('service_links')
      .update({ renewal_date: m.to, updated_at: new Date().toISOString() })
      .eq('id', m.id)
      .eq('renewal_date', m.from)
      .select('id');
    if (upErr) {
      errors.push(`${m.id}: ${upErr.message}`);
      continue;
    }
    if (!updated?.length) continue;
    moved++;

    // Each renewal it moved past was a charge: record one payment per cycle (never duplicated).
    const svc = services.find((x) => x.id === m.id);
    if (svc) {
      const anchor = svc.startDate ? Number(svc.startDate.slice(8, 10)) : undefined;
      const rows = crossedRenewals(m.from, m.to, svc.billingCycle, anchor).map((due) => ({
        id: renewalPaymentId(svc.id, due),
        workspace_id: svc.workspaceId,
        service_link_id: svc.id,
        source_id: svc.paymentSourceId ?? null,
        paid_on: due,
        amount: svc.cost,
        currency: svc.currency,
        origin: 'auto_renew',
      }));
      if (rows.length) {
        // Ignored if the payments table doesn't exist yet (0003 not run): the roll-forward still counts.
        await admin.from('payments').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
      }
    }
    await admin.from('audit_logs').insert({
      id: 'audit-' + crypto.randomUUID().slice(0, 12),
      workspace_id: m.workspaceId,
      item_type: 'serviceLink',
      item_id: m.id,
      action: 'update',
      changed_by: 'auto-renew',
      details: describeRollForward(m),
    });
  }
  return { moved, errors };
}

export interface DeliveryAttempt {
  channel: 'telegram' | 'email';
  ok: boolean;
  error?: string;
}

/**
 * Telegram first, email as backup: email is used only when Telegram isn't linked, is switched
 * off, or the Telegram send fails. Returns every attempt so each can be logged.
 */
export async function deliverReminders(opts: {
  settings: SettingsRow;
  workspaceName: string;
  alerts: DueAlert[];
  etbPerUsd: number;
  appUrl?: string;
  heading?: string;
}): Promise<{ attempts: DeliveryAttempt[]; summary: Record<string, unknown> }> {
  const { settings, workspaceName, alerts, etbPerUsd, appUrl } = opts;
  const attempts: DeliveryAttempt[] = [];
  const summary: Record<string, unknown> = {};

  const telegramReady = settings.telegramEnabled && Boolean(settings.telegramChatId);
  if (telegramReady) {
    try {
      const batches = settings.digestMode === 'individual' ? alerts.map((a) => [a]) : [alerts];
      for (const batch of batches) {
        await sendTelegramMessage(
          settings.telegramChatId,
          buildReminderMessage({ workspaceName, items: batch, etbPerUsd, appUrl, heading: opts.heading })
        );
      }
      attempts.push({ channel: 'telegram', ok: true });
      summary.telegram = alerts.length;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      attempts.push({ channel: 'telegram', ok: false, error });
      summary.telegramError = error;
    }
  } else {
    summary.telegram = settings.telegramChatId ? 'switched off' : 'not linked';
  }

  const telegramOk = attempts.some((a) => a.channel === 'telegram' && a.ok);
  if (!telegramOk) {
    if (settings.emailEnabled && settings.email) {
      try {
        const subject =
          alerts.length === 1 ? `StackTrack: ${alerts[0].title}` : `StackTrack: ${alerts.length} renewals & dates need attention`;
        await sendEmail(
          settings.email,
          subject,
          buildDigestHtml(workspaceName, alerts, appUrl),
          buildDigestText(workspaceName, alerts, appUrl)
        );
        attempts.push({ channel: 'email', ok: true });
        summary.email = alerts.length;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        attempts.push({ channel: 'email', ok: false, error });
        summary.emailError = error;
      }
    } else {
      summary.email = 'backup off';
    }
  }
  return { attempts, summary };
}

/** Cards, people, payments and services for the money alerts. Null if the payments tables don't exist yet. */
export async function loadMoneyContext(
  admin: SupabaseClient,
  workspaceId: string
): Promise<{ sources: PaymentSource[]; services: ServiceLink[]; payments: Payment[]; transactions: SourceTransaction[] } | null> {
  const [src, svc, pay, tx] = await Promise.all([
    admin.from('payment_sources').select('*').eq('workspace_id', workspaceId),
    admin.from('service_links').select('*').eq('workspace_id', workspaceId),
    admin.from('payments').select('*').eq('workspace_id', workspaceId),
    admin.from('source_transactions').select('*').eq('workspace_id', workspaceId),
  ]);
  if (src.error || pay.error || tx.error || svc.error) return null;
  const num = <T,>(rows: unknown[] | null, fields: string[]) =>
    (rows ?? []).map((r) => {
      const o = fromRow<Record<string, unknown>>(r as Record<string, unknown>);
      for (const f of fields) if (o[f] !== undefined) o[f] = Number(o[f]);
      return o as T;
    });
  return {
    sources: num<PaymentSource>(src.data, ['openingBalance', 'lowBalance']),
    services: num<ServiceLink>(svc.data, ['cost']),
    payments: num<Payment>(pay.data, ['amount', 'etbPaid']),
    transactions: num<SourceTransaction>(tx.data, ['amount', 'etbPaid']),
  };
}

/** What the monthly summary needs for one workspace. Null if the payments tables don't exist yet. */
export async function loadMonthlyInput(admin: SupabaseClient, workspaceId: string, etbPerUsd: number): Promise<MonthlyInput | null> {
  const money = await loadMoneyContext(admin, workspaceId);
  if (!money) return null;
  const { data } = await admin.from('products').select('id,name').eq('workspace_id', workspaceId);
  return { ...money, products: (data ?? []) as { id: string; name: string }[], etbPerUsd };
}

/**
 * Sends last month's spending summary (the reminder job calls this on the 1st). Returns the delivery
 * summary and the reminder_logs rows that stop it being sent twice; null when there's nothing to say.
 */
export async function sendMonthlySummary(
  admin: SupabaseClient,
  opts: {
    ws: Pick<Workspace, 'id' | 'name'>;
    settings: SettingsRow;
    money: Omit<MonthlyInput, 'products' | 'etbPerUsd'>;
    etbPerUsd: number;
    month: string;
    appUrl?: string;
    now: Date;
  }
): Promise<{ summary: Record<string, unknown>; logRows: Record<string, unknown>[] } | null> {
  const { ws, month } = opts;
  const { data: prodRows } = await admin.from('products').select('id,name').eq('workspace_id', ws.id);
  const summary = summarizeMonth({ ...opts.money, products: (prodRows ?? []) as { id: string; name: string }[], etbPerUsd: opts.etbPerUsd }, month);
  if (!summary.count && !summary.upcoming.count) return null;
  const msg = buildMonthlyMessage(summary, ws.name, { includeUpcoming: true });
  const outcome = await deliverLines({
    settings: opts.settings,
    icon: '📊',
    heading: msg.title,
    lines: msg.plain,
    telegramHtml: msg.html,
    subject: `StackTrack: ${monthName(month)} spending`,
    appUrl: opts.appUrl,
    linkLabel: 'Open Cards & Payments',
  });
  return {
    summary: outcome.summary,
    logRows: outcome.attempts.map((attempt) => ({
      workspace_id: ws.id,
      item_type: 'workspace',
      item_id: `${ws.id}:month:${month}`,
      channel: attempt.channel,
      lead_day: 0,
      sent_at: opts.now.toISOString(),
      status: attempt.ok ? 'sent' : 'failed',
    })),
  };
}

/** Money alerts as one message: Telegram first, email as backup. */
export function deliverMoneyAlerts(opts: {
  settings: SettingsRow;
  workspaceName: string;
  alerts: MoneyAlert[];
  appUrl?: string;
}): Promise<{ attempts: DeliveryAttempt[]; summary: Record<string, unknown> }> {
  return deliverLines({
    settings: opts.settings,
    icon: '💰',
    heading: `Money · ${opts.workspaceName}`,
    lines: opts.alerts.map((a) => a.text),
    subject: 'StackTrack: money reminders',
    appUrl: opts.appUrl,
    linkLabel: 'Open Cards & Payments',
  });
}

/** A short list of plain-text lines as one message: Telegram first, email as backup. */
export async function deliverLines(opts: {
  settings: SettingsRow;
  icon: string;
  heading: string;
  lines: string[];
  subject: string;
  appUrl?: string;
  linkLabel: string;
  /** Telegram text already formatted as HTML (instead of the plain lines). */
  telegramHtml?: string;
}): Promise<{ attempts: DeliveryAttempt[]; summary: Record<string, unknown> }> {
  const { settings, lines, appUrl } = opts;
  const attempts: DeliveryAttempt[] = [];
  const summary: Record<string, unknown> = {};

  if (settings.telegramEnabled && settings.telegramChatId) {
    try {
      const text =
        (opts.telegramHtml ?? `${opts.icon} <b>${escapeHtml(opts.heading)}</b>\n\n` + lines.map(escapeHtml).join('\n\n')) +
        (appUrl ? `\n\n<a href="${escapeHtml(appUrl)}">${escapeHtml(opts.linkLabel)}</a>` : '');
      await sendTelegramMessage(settings.telegramChatId, { text });
      attempts.push({ channel: 'telegram', ok: true });
      summary.telegram = lines.length;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      attempts.push({ channel: 'telegram', ok: false, error });
      summary.telegramError = error;
    }
  }
  if (!attempts.some((a) => a.ok) && settings.emailEnabled && settings.email) {
    try {
      const html =
        `<div style="font-family:system-ui,sans-serif;font-size:14px"><h2 style="margin:0 0 12px">${escapeHtml(opts.heading)}</h2>` +
        `<ul style="padding-left:18px">${lines.map((l) => `<li style="margin:0 0 8px">${escapeHtml(l)}</li>`).join('')}</ul>` +
        (appUrl ? `<p><a href="${escapeHtml(appUrl)}">${escapeHtml(opts.linkLabel)}</a></p>` : '') +
        '</div>';
      await sendEmail(settings.email, opts.subject, html, lines.join('\n\n'));
      attempts.push({ channel: 'email', ok: true });
      summary.email = lines.length;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      attempts.push({ channel: 'email', ok: false, error });
      summary.emailError = error;
    }
  }
  return { attempts, summary };
}

export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.REMINDER_FROM_EMAIL || 'StackTrack <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

/** Constant-time compare for shared secrets. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
