import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fromRow } from './db';
import { buildCandidates, type DueCandidate } from '../utils/reminderDigest';
import type { ImportantDate, NotificationSettings, Product, ServiceLink, Workspace } from '../types';

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

export async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
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
