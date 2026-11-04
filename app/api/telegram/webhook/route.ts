import { NextResponse, type NextRequest } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/server';
import { fromRow } from '@/lib/db';
import { loadWorkspaceCandidates, safeEqual } from '@/lib/reminders-server';
import { formatAlertLine, itemsDueWithin, localDateAndHour } from '@/utils/reminderDigest';
import { computeSnoozeDate } from '@/utils/reminders';
import type { Workspace } from '@/types';

export const dynamic = 'force-dynamic';

const HELP =
  'StackTrack commands:\n' +
  '/due - overdue items and everything due in the next 30 days\n' +
  '/week - items due in the next 7 days\n' +
  '/snooze <id> <days> - snooze an important date\n' +
  '/stop - stop Telegram reminders for this chat';

/**
 * Telegram bot webhook. Register it once (see README):
 *   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<app>/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
 */
export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const header = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!secret || !safeEqual(header, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const update = await request.json().catch(() => null);
  const message = update?.message;
  if (!message?.text || !message.chat?.id) return NextResponse.json({ ok: true });

  const chatId = String(message.chat.id);
  const text: string = message.text.trim();
  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.split('@')[0].toLowerCase(); // "/due@MyBot" in groups
  const reply = (body: string) => NextResponse.json({ method: 'sendMessage', chat_id: chatId, text: body });

  const admin = getAdminSupabase();

  if (command === '/start') {
    const code = args[0];
    if (!code) {
      return reply('Welcome to StackTrack! Open Settings in the app and tap "Connect Telegram" to link this chat.');
    }
    const { data, error } = await admin
      .from('notification_settings')
      .update({ telegram_chat_id: chatId, telegram_enabled: true })
      .eq('telegram_verification_code', code)
      .select('workspace_id');
    if (error || !data?.length) {
      return reply('That link code was not recognised. Generate a new one from StackTrack Settings.');
    }
    return reply('✅ Connected to StackTrack! Reminders will arrive here.\n\n' + HELP);
  }

  // Every other command works on the workspaces linked to this chat.
  const { data: links, error: linkErr } = await admin
    .from('notification_settings')
    .select('workspace_id')
    .eq('telegram_chat_id', chatId);
  if (linkErr) return reply('Something went wrong. Please try again later.');
  const workspaceIds = (links ?? []).map((l) => l.workspace_id as string);
  if (!workspaceIds.length) {
    return reply('This chat is not linked yet. Open StackTrack Settings and tap "Connect Telegram".');
  }

  if (command === '/stop') {
    await admin
      .from('notification_settings')
      .update({ telegram_chat_id: '', telegram_enabled: false })
      .eq('telegram_chat_id', chatId);
    return reply('Telegram reminders are off for this chat. Reconnect any time from Settings.');
  }

  if (command === '/due' || command === '/week') {
    const horizon = command === '/week' ? 7 : 30;
    const { data: wsRows } = await admin.from('workspaces').select('*').in('id', workspaceIds);
    const sections: string[] = [];
    for (const ws of (wsRows ?? []).map((r) => fromRow<Workspace>(r))) {
      const today = localDateAndHour(new Date(), ws.timezone || 'UTC').date;
      const items = itemsDueWithin(await loadWorkspaceCandidates(admin, ws), today, horizon);
      if (!items.length) continue;
      sections.push(
        `${ws.name}\n` +
          items
            .slice(0, 25)
            .map((i) => `• ${formatAlertLine(i)}${i.itemType === 'importantDate' ? `\n   id: ${i.itemId}` : ''}`)
            .join('\n')
      );
    }
    if (!sections.length) return reply(`Nothing due in the next ${horizon} days. 🎉`);
    return reply(sections.join('\n\n'));
  }

  if (command === '/snooze') {
    const [id, daysRaw] = args;
    const days = Number(daysRaw);
    if (!id || !Number.isInteger(days) || days < 1 || days > 365) {
      return reply('Usage: /snooze <id> <days>   (find the id with /due)');
    }
    const { data: row } = await admin
      .from('important_dates')
      .select('id,title,due_date,snoozed_until,workspace_id')
      .eq('id', id)
      .in('workspace_id', workspaceIds)
      .maybeSingle();
    if (!row) return reply('No important date with that id in your linked workspaces. Service renewals cannot be snoozed.');

    const today = new Date().toISOString().slice(0, 10);
    const until = computeSnoozeDate(today, days);
    const { error } = await admin
      .from('important_dates')
      .update({ status: 'snoozed', snoozed_until: until })
      .eq('id', row.id);
    if (error) return reply('Could not snooze that item. Please try again.');
    return reply(`😴 Snoozed "${row.title}" until ${until}.`);
  }

  return reply(HELP);
}

export function GET() {
  return new NextResponse('StackTrack Telegram webhook is running.', { status: 200 });
}
