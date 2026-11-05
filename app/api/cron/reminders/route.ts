import { NextResponse, type NextRequest } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/server';
import { refreshAutoRates } from '@/lib/fx-server';
import { fromRow } from '@/lib/db';
import {
  deliverReminders,
  loadWorkspaceCandidates,
  rollForwardAutoRenewals,
  safeEqual,
  type SettingsRow,
} from '@/lib/reminders-server';
import { localDateAndHour, selectAlerts } from '@/utils/reminderDigest';
import type { ReminderLog, Workspace } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Reminder job. Call it every hour from cron-job.org:
 *   GET https://<your-app>/api/cron/reminders
 *   Header: Authorization: Bearer <CRON_SECRET>
 *
 * Each workspace is processed when its local hour matches its digest time.
 * Add ?force=1 to ignore the hour check (handy for a manual test run).
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') ?? '';
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const force = request.nextUrl.searchParams.get('force') === '1';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const now = new Date();
  const admin = getAdminSupabase();

  // 1. Move auto-renewed bills to their next date before deciding what is due.
  const autoRenew = await rollForwardAutoRenewals(admin, now.toISOString().slice(0, 10));
  // 2. Keep automatic USD->ETB rates fresh (daily).
  const fx = await refreshAutoRates(admin, now);

  const { data: settingsRows, error: settingsErr } = await admin
    .from('notification_settings')
    .select('*')
    .or('email_enabled.eq.true,telegram_enabled.eq.true');
  if (settingsErr) return NextResponse.json({ error: settingsErr.message }, { status: 500 });

  const summary: Record<string, unknown>[] = [];

  for (const raw of settingsRows ?? []) {
    const settings = fromRow<SettingsRow>(raw);
    const result: Record<string, unknown> = { workspaceId: settings.workspaceId };
    summary.push(result);

    try {
      const { data: wsRow, error: wsErr } = await admin
        .from('workspaces')
        .select('*')
        .eq('id', settings.workspaceId)
        .single();
      if (wsErr || !wsRow) throw new Error(wsErr?.message ?? 'workspace not found');
      const ws = fromRow<Workspace>(wsRow);

      const { date: today, hour } = localDateAndHour(now, ws.timezone || 'UTC');
      const digestHour = Number((settings.digestTime || '08:00').split(':')[0]);
      if (!force && hour !== digestHour) {
        result.skipped = `local hour ${hour} != digest hour ${digestHour}`;
        continue;
      }

      const candidates = await loadWorkspaceCandidates(admin, ws);
      if (!candidates.length) {
        result.skipped = 'nothing scheduled';
        continue;
      }
      const { data: logRows, error: logErr } = await admin
        .from('reminder_logs')
        .select('*')
        .eq('workspace_id', ws.id)
        .in(
          'item_id',
          candidates.map((c) => c.itemId)
        );
      if (logErr) throw new Error(logErr.message);
      const logs = (logRows ?? []).map((r) => fromRow<ReminderLog>(r));

      // An item counts as reminded once it reached you on either channel, so treat all
      // successful sends as one channel when deciding what is due today.
      const delivered = logs.filter((l) => l.status === 'sent').map((l) => ({ ...l, channel: 'telegram' as const }));
      const alerts = selectAlerts(candidates, today, delivered, 'telegram');
      if (!alerts.length) {
        result.sent = 0;
        continue;
      }

      const rate = ws.exchangeRates?.ETB_per_USD || 155;
      const outcome = await deliverReminders({ settings, workspaceName: ws.name, alerts, etbPerUsd: rate, appUrl });
      Object.assign(result, outcome.summary);

      const rows = outcome.attempts.flatMap((attempt) =>
        alerts.map((a) => ({
          workspace_id: ws.id,
          item_type: a.itemType,
          item_id: a.itemId,
          channel: attempt.channel,
          lead_day: a.leadDay,
          sent_at: now.toISOString(),
          status: attempt.ok ? 'sent' : 'failed',
        }))
      );
      if (rows.length) {
        const { error: insErr } = await admin.from('reminder_logs').insert(rows);
        if (insErr) result.logError = insErr.message;
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json({ ok: true, ranAt: now.toISOString(), autoRenew, fx, workspaces: summary });
}

export const GET = handle;
export const POST = handle;
