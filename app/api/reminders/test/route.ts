import { NextResponse, type NextRequest } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/server';
import { fromRow } from '@/lib/db';
import { loadWorkspaceCandidates, sendEmail, sendTelegram, type SettingsRow } from '@/lib/reminders-server';
import { buildDigestHtml, buildDigestText, itemsDueWithin, localDateAndHour, type DueAlert } from '@/utils/reminderDigest';
import type { Workspace } from '@/types';

export const dynamic = 'force-dynamic';

type ChannelResult = { status: 'sent' | 'skipped' | 'error'; detail: string };

/**
 * Sends a test reminder for one workspace to its saved Telegram chat and/or email, right now.
 * Caller must be signed in (Supabase access token) and own or belong to the workspace.
 */
async function handleTest(request: NextRequest) {
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : '';
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required.' }, { status: 400 });

  const admin = getAdminSupabase();
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return NextResponse.json({ error: 'Your session has expired. Sign in again.' }, { status: 401 });
  const uid = userData.user.id;

  const { data: wsRow } = await admin.from('workspaces').select('*').eq('id', workspaceId).maybeSingle();
  const ws = wsRow ? fromRow<Workspace>(wsRow) : null;
  if (!ws || (ws.ownerId !== uid && !(ws.memberUids ?? []).includes(uid))) {
    return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
  }

  const { data: settingsRow } = await admin
    .from('notification_settings')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const settings = settingsRow ? fromRow<SettingsRow>(settingsRow) : null;

  // Preview what a real digest would contain: overdue + next 30 days.
  const today = localDateAndHour(new Date(), ws.timezone || 'UTC').date;
  const upcoming = itemsDueWithin(await loadWorkspaceCandidates(admin, ws), today, 30).slice(0, 10) as DueAlert[];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const intro = upcoming.length
    ? `✅ Test from StackTrack: reminders work. This is what's due in the next 30 days:`
    : `✅ Test from StackTrack: reminders work. Nothing is due in the next 30 days.`;
  const text = upcoming.length ? `${intro}\n\n${buildDigestText(ws.name, upcoming, appUrl)}` : `${intro}\n\n${ws.name}`;

  const result: Record<'telegram' | 'email', ChannelResult> = {
    telegram: { status: 'skipped', detail: 'Telegram is not linked yet.' },
    email: { status: 'skipped', detail: 'Email delivery is off or no address is set.' },
  };

  if (settings?.telegramChatId && !settings.telegramEnabled) {
    result.telegram = { status: 'skipped', detail: 'Telegram alerts are switched off in Settings.' };
  } else if (settings?.telegramChatId) {
    try {
      await sendTelegram(settings.telegramChatId, text);
      result.telegram = { status: 'sent', detail: 'Check your Telegram.' };
    } catch (err) {
      result.telegram = { status: 'error', detail: err instanceof Error ? err.message : String(err) };
    }
  }

  if (settings?.emailEnabled && settings.email) {
    try {
      const html =
        `<p style="font-family:system-ui,sans-serif">${intro.replace(/</g, '&lt;')}</p>` +
        (upcoming.length ? buildDigestHtml(ws.name, upcoming, appUrl) : '');
      await sendEmail(settings.email, 'StackTrack test reminder', html, text);
      result.email = { status: 'sent', detail: `Sent to ${settings.email}.` };
    } catch (err) {
      result.email = { status: 'error', detail: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({ ok: true, ...result, items: upcoming.length });
}

export async function POST(request: NextRequest) {
  try {
    return await handleTest(request);
  } catch (err) {
    console.error('[reminders/test]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Something went wrong sending the test.' },
      { status: 500 }
    );
  }
}
