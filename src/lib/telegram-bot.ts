import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fromRow } from './db';
import { loadWorkspaceCandidates } from './reminders-server';
import { itemsDueWithin, localDateAndHour } from '../utils/reminderDigest';
import { computeNextRecurringDate, snoozeUntil } from '../utils/reminders';
import { advanceAfterPayment } from '../utils/renewals';
import { buildReminderMessage, escapeHtml, markItemHandled, parseAction, type InlineKeyboard } from '../utils/telegramUi';
import type { BillingCycle, RecurrenceType, Workspace } from '../types';

export type TgCall = <T = unknown>(method: string, payload: Record<string, unknown>) => Promise<T>;

export interface BotDeps {
  admin: SupabaseClient;
  tg: TgCall;
  now?: Date;
  appUrl?: string;
}

export const HELP_TEXT =
  '<b>StackTrack bot</b>\n' +
  '/due: overdue and due in the next 30 days\n' +
  '/week: due in the next 7 days\n' +
  '/snooze &lt;id&gt; &lt;days&gt;: snooze an important date\n' +
  '/stop: stop reminders in this chat\n\n' +
  'Reminders come with buttons: ✅ Done, 😴 snooze, ✅ Paid.';

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 12)}`;

/** Entry point for every Telegram update the webhook receives. */
export async function handleTelegramUpdate(update: any, deps: BotDeps): Promise<void> {
  if (update?.callback_query) return handleButton(update.callback_query, deps);

  const message = update?.message;
  if (!message?.text || !message.chat?.id) return;
  if (message.chat.type !== 'private') return; // the bot only works in your own private chat

  const chatId = String(message.chat.id);
  const [rawCommand, ...args] = String(message.text).trim().split(/\s+/);
  const command = rawCommand.split('@')[0].toLowerCase();
  const reply = (text: string, reply_markup?: InlineKeyboard) =>
    deps.tg('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(reply_markup ? { reply_markup } : {}),
    });
  const { admin } = deps;

  if (command === '/start') {
    const code = args[0];
    if (!code) {
      await reply('Welcome to StackTrack! Open Settings in the app and tap <b>Connect Telegram</b> to link this chat.');
      return;
    }
    const { data: before } = await admin
      .from('notification_settings')
      .select('workspace_id, telegram_chat_id')
      .eq('telegram_verification_code', code)
      .maybeSingle();
    const prev = before as { workspace_id: string; telegram_chat_id: string } | null;
    // The code is single-use: it is cleared as the chat is linked, so a leaked code can't be reused.
    const { data, error } = await admin
      .from('notification_settings')
      .update({ telegram_chat_id: chatId, telegram_enabled: true, telegram_verification_code: null })
      .eq('telegram_verification_code', code)
      .select('workspace_id');
    if (error || !data?.length || !prev) {
      await reply('That link code was not recognised or was already used. Generate a new one from StackTrack Settings.');
      return;
    }
    const moved = Boolean(prev.telegram_chat_id) && prev.telegram_chat_id !== chatId;
    if (moved) {
      await deps
        .tg('sendMessage', {
          chat_id: prev.telegram_chat_id,
          text:
            '⚠️ StackTrack reminders were moved to another Telegram chat.\n\nIf this wasn\'t you: open StackTrack → ' +
            'Settings → Telegram reminders, re-link this chat, and change your password.',
        })
        .catch(() => undefined);
    }
    const { data: ws } = await admin.from('workspaces').select('owner_id').eq('id', prev.workspace_id).maybeSingle();
    await audit(
      admin,
      prev.workspace_id,
      'security',
      (ws as { owner_id?: string } | null)?.owner_id ?? prev.workspace_id,
      'telegram_linked',
      moved ? 'Telegram reminders moved to a different chat' : 'Telegram chat linked'
    );
    await reply('✅ Connected to StackTrack! Reminders will arrive here.\n\n' + HELP_TEXT);
    return;
  }

  const workspaceIds = await linkedWorkspaceIds(admin, chatId);
  if (!workspaceIds.length) {
    await reply('This chat is not linked yet. Open StackTrack Settings and tap <b>Connect Telegram</b>.');
    return;
  }

  if (command === '/stop') {
    await admin
      .from('notification_settings')
      .update({ telegram_chat_id: '', telegram_enabled: false })
      .eq('telegram_chat_id', chatId);
    await reply('Telegram reminders are off for this chat. Reconnect any time from Settings.');
    return;
  }

  if (command === '/due' || command === '/week') {
    const horizon = command === '/week' ? 7 : 30;
    const { data: wsRows } = await admin.from('workspaces').select('*').in('id', workspaceIds);
    let sentAny = false;
    for (const ws of (wsRows ?? []).map((r) => fromRow<Workspace>(r))) {
      const today = localDateAndHour(deps.now ?? new Date(), ws.timezone || 'UTC').date;
      const items = itemsDueWithin(await loadWorkspaceCandidates(admin, ws), today, horizon);
      if (!items.length) continue;
      const msg = buildReminderMessage({
        workspaceName: ws.name,
        items,
        etbPerUsd: ws.exchangeRates?.ETB_per_USD || 155,
        appUrl: deps.appUrl,
        heading: `Due in the next ${horizon} days · ${ws.name}`,
      });
      await reply(msg.text, msg.reply_markup);
      sentAny = true;
    }
    if (!sentAny) await reply(`Nothing due in the next ${horizon} days. 🎉`);
    return;
  }

  if (command === '/snooze') {
    const [id, daysRaw] = args;
    const days = Number(daysRaw);
    if (!id || !Number.isInteger(days) || days < 1 || days > 365) {
      await reply('Usage: /snooze &lt;id&gt; &lt;days&gt;. Easier: tap 😴 under a reminder.');
      return;
    }
    const result = await snoozeDate(admin, workspaceIds, id, days, null, deps.now);
    await reply(escapeHtml(result.note));
    return;
  }

  await reply(HELP_TEXT);
}

async function linkedWorkspaceIds(admin: SupabaseClient, chatId: string): Promise<string[]> {
  const { data } = await admin.from('notification_settings').select('workspace_id').eq('telegram_chat_id', chatId);
  return (data ?? []).map((r: { workspace_id: string }) => r.workspace_id);
}

async function workspaceToday(admin: SupabaseClient, workspaceId: string, now = new Date()): Promise<string> {
  const { data } = await admin.from('workspaces').select('timezone').eq('id', workspaceId).maybeSingle();
  return localDateAndHour(now, (data as { timezone?: string } | null)?.timezone || 'UTC').date;
}

async function audit(admin: SupabaseClient, workspaceId: string, itemType: string, itemId: string, action: string, details: string) {
  await admin.from('audit_logs').insert({
    id: newId('audit'),
    workspace_id: workspaceId,
    item_type: itemType,
    item_id: itemId,
    action,
    changed_by: 'telegram',
    details,
  });
}

type ActionResult = { ok: boolean; note: string };

/** A tapped reminder button. Only works in a private chat linked to the item's workspace. */
async function handleButton(cq: any, deps: BotDeps): Promise<void> {
  const answer = (text: string, show_alert = false) =>
    deps.tg('answerCallbackQuery', { callback_query_id: cq.id, text, show_alert });

  if (cq.data === 'noop') {
    await answer('Already handled.');
    return;
  }
  const chat = cq.message?.chat;
  if (!chat?.id || chat.type !== 'private') {
    await answer('Use these buttons in your private chat with the bot.', true);
    return;
  }
  const action = parseAction(cq.data);
  if (!action) {
    await answer('This button is no longer valid.', true);
    return;
  }
  const workspaceIds = await linkedWorkspaceIds(deps.admin, String(chat.id));
  if (!workspaceIds.length) {
    await answer('This chat is not linked to StackTrack.', true);
    return;
  }

  let result: ActionResult;
  if (action.kind === 'paid') {
    result = await markServicePaid(deps.admin, workspaceIds, action.itemId, action.due, deps.now);
  } else if (action.kind === 'done') {
    result = await markDateDone(deps.admin, workspaceIds, action.itemId, action.due, deps.now);
  } else {
    result = await snoozeDate(deps.admin, workspaceIds, action.itemId, action.kind === 's3' ? 3 : 7, action.due, deps.now);
  }

  if (result.ok && cq.message?.message_id) {
    const markup = markItemHandled(cq.message.reply_markup, action.itemId, `✔ ${result.note}`);
    await deps
      .tg('editMessageReplyMarkup', { chat_id: chat.id, message_id: cq.message.message_id, reply_markup: markup })
      .catch(() => undefined); // the message may be too old to edit; the action itself succeeded
  }
  await answer(result.note, !result.ok);
}

const STALE = 'This reminder is out of date. Send /due for the current list.';

async function loadDate(admin: SupabaseClient, workspaceIds: string[], id: string) {
  const { data } = await admin.from('important_dates').select('*').eq('id', id).in('workspace_id', workspaceIds).maybeSingle();
  return data as Record<string, any> | null;
}

async function markDateDone(
  admin: SupabaseClient,
  workspaceIds: string[],
  id: string,
  due: string,
  now?: Date
): Promise<ActionResult> {
  const row = await loadDate(admin, workspaceIds, id);
  if (!row) return { ok: false, note: 'Item not found.' };
  if (row.status === 'done') return { ok: false, note: 'Already done.' };
  if ((row.snoozed_until || row.due_date) !== due) return { ok: false, note: STALE };

  const stamp = (now ?? new Date()).toISOString();
  const { error } = await admin.from('important_dates').update({ status: 'done', completed_at: stamp }).eq('id', id);
  if (error) return { ok: false, note: `Couldn't update: ${error.message}` };

  const next = computeNextRecurringDate(row.due_date, row.recurrence as RecurrenceType, row.custom_recurrence_days ?? undefined);
  if (next) {
    const { id: _old, ...rest } = row;
    await admin.from('important_dates').insert({
      ...rest,
      id: newId('date'),
      due_date: next,
      status: 'open',
      snoozed_until: null,
      completed_at: null,
      created_at: stamp,
    });
  }
  const note = next ? `Done · next one ${next}` : 'Done';
  await audit(admin, row.workspace_id, 'importantDate', id, 'mark_done', `Marked "${row.title}" done via Telegram${next ? `; next ${next}` : ''}`);
  return { ok: true, note };
}

async function snoozeDate(
  admin: SupabaseClient,
  workspaceIds: string[],
  id: string,
  days: number,
  due: string | null,
  now?: Date
): Promise<ActionResult> {
  const row = await loadDate(admin, workspaceIds, id);
  if (!row) return { ok: false, note: 'No important date with that id in your linked workspaces.' };
  if (row.status === 'done') return { ok: false, note: 'Already done.' };
  const current = row.snoozed_until || row.due_date;
  if (due && current !== due) return { ok: false, note: STALE };

  const today = await workspaceToday(admin, row.workspace_id, now);
  const until = snoozeUntil(current, today, days);
  const { error } = await admin.from('important_dates').update({ status: 'snoozed', snoozed_until: until }).eq('id', id);
  if (error) return { ok: false, note: `Couldn't snooze: ${error.message}` };
  await audit(admin, row.workspace_id, 'importantDate', id, 'snooze', `Snoozed "${row.title}" to ${until} via Telegram`);
  return { ok: true, note: `Snoozed to ${until}` };
}

async function markServicePaid(
  admin: SupabaseClient,
  workspaceIds: string[],
  id: string,
  due: string,
  now?: Date
): Promise<ActionResult> {
  const { data } = await admin.from('service_links').select('*').eq('id', id).in('workspace_id', workspaceIds).maybeSingle();
  const row = data as Record<string, any> | null;
  if (!row) return { ok: false, note: 'Service not found.' };
  if (row.renewal_date !== due) return { ok: false, note: STALE };

  const today = await workspaceToday(admin, row.workspace_id, now);
  const anchor = row.start_date ? Number(String(row.start_date).slice(8, 10)) : undefined;
  const next = advanceAfterPayment(row.renewal_date, row.billing_cycle as BillingCycle, today, anchor);
  if (!next) return { ok: false, note: 'This service has no next renewal (one-time or free).' };

  const { data: updated, error } = await admin
    .from('service_links')
    .update({ renewal_date: next, updated_at: (now ?? new Date()).toISOString() })
    .eq('id', id)
    .eq('renewal_date', due)
    .select('id');
  if (error) return { ok: false, note: `Couldn't update: ${error.message}` };
  if (!updated?.length) return { ok: false, note: STALE };

  await audit(admin, row.workspace_id, 'serviceLink', id, 'update', `Marked ${row.provider_name} paid via Telegram: ${due} → ${next}`);
  return { ok: true, note: `Paid · next ${next}` };
}
