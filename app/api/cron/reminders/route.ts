import { NextResponse, type NextRequest } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/server';
import { fromRow } from '@/lib/db';
import { loadWorkspaceCandidates, safeEqual, sendEmail, sendTelegram, type SettingsRow } from '@/lib/reminders-server';
import {
  buildDigestHtml,
  buildDigestText,
  formatAlertLine,
  localDateAndHour,
  selectAlerts,
  type DueAlert,
} from '@/utils/reminderDigest';
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

      const channels: { channel: 'email' | 'telegram'; send: (alerts: DueAlert[]) => Promise<void> }[] = [];

      if (settings.emailEnabled && settings.email) {
        channels.push({
          channel: 'email',
          send: async (alerts) => {
            const subject =
              alerts.length === 1
                ? `StackTrack: ${alerts[0].title}`
                : `StackTrack: ${alerts.length} renewals & dates need attention`;
            await sendEmail(
              settings.email,
              subject,
              buildDigestHtml(ws.name, alerts, appUrl),
              buildDigestText(ws.name, alerts, appUrl)
            );
          },
        });
      }
      if (settings.telegramEnabled && settings.telegramChatId) {
        channels.push({
          channel: 'telegram',
          send: async (alerts) => {
            if (settings.digestMode === 'individual') {
              for (const a of alerts) await sendTelegram(settings.telegramChatId, `⏰ ${formatAlertLine(a)}`);
            } else {
              await sendTelegram(settings.telegramChatId, buildDigestText(ws.name, alerts, appUrl));
            }
          },
        });
      }

      for (const { channel, send } of channels) {
        const alerts = selectAlerts(candidates, today, logs, channel);
        if (!alerts.length) {
          result[channel] = 0;
          continue;
        }

        let status: 'sent' | 'failed' = 'sent';
        try {
          if (channel === 'email' && settings.digestMode === 'individual') {
            for (const a of alerts) await send([a]);
          } else {
            await send(alerts);
          }
        } catch (err) {
          status = 'failed';
          result[`${channel}Error`] = err instanceof Error ? err.message : String(err);
        }

        // Failed sends are logged but don't block a retry next hour (evaluateReminder only counts 'sent').
        const { error: insErr } = await admin.from('reminder_logs').insert(
          alerts.map((a) => ({
            workspace_id: ws.id,
            item_type: a.itemType,
            item_id: a.itemId,
            channel,
            lead_day: a.leadDay,
            sent_at: now.toISOString(),
            status,
          }))
        );
        if (insErr) result[`${channel}LogError`] = insErr.message;
        result[channel] = status === 'sent' ? alerts.length : 0;
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json({ ok: true, ranAt: now.toISOString(), workspaces: summary });
}

export const GET = handle;
export const POST = handle;
