import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fromRow } from './db';
import { loadMonthlyInput, loadWorkspaceCandidates } from './reminders-server';
import { buildMonthlyMessage, isMonth, shiftMonth, summarizeMonth } from '../utils/monthlySummary';
import { itemsDueWithin, localDateAndHour } from '../utils/reminderDigest';
import { computeNextRecurringDate, snoozeUntil } from '../utils/reminders';
import { advanceAfterPayment } from '../utils/renewals';
import { renewalPaymentId } from '../utils/ledger';
import { buildReceiptReply, buildReminderMessage, escapeHtml, markItemHandled, parseAction, type InlineKeyboard } from '../utils/telegramUi';
import { MAX_RECEIPT_BYTES, looksLikeReceiptText, receiptMimeType } from '../utils/receipts';
import {
  confirmReceiptOnServer,
  createReceipt,
  ignoreReceiptOnServer,
  loadReceipt,
  markReceiptFailed,
  processReceipt,
  storeReceiptFile,
} from './receipts-server';
import type { BillingCycle, RecurrenceType, Workspace } from '../types';

export type TgCall = <T = unknown>(method: string, payload: Record<string, unknown>) => Promise<T>;

export interface BotDeps {
  admin: SupabaseClient;
  tg: TgCall;
  now?: Date;
  appUrl?: string;
  /** Downloads a file sent to the bot. */
  download?: (fileId: string, maxBytes: number) => Promise<Uint8Array>;
  /** Runs slow work (reading a receipt) after Telegram has its answer. Default: run it right away. */
  defer?: (work: () => Promise<void>) => void;
}

export const HELP_TEXT =
  '<b>StackTrack bot</b>\n' +
  '/due: overdue and due in the next 30 days\n' +
  '/week: due in the next 7 days\n' +
  "/month: last month's spending (or /month 2026-10)\n" +
  '/snooze &lt;id&gt; &lt;days&gt;: snooze an important date\n' +
  '/stop: stop reminders in this chat\n\n' +
  'Reminders come with buttons: ✅ Done, 😴 snooze, ✅ Paid.\n\n' +
  '🧾 Send a receipt (photo, PDF or forwarded email) and it goes to your Receipts inbox.';

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 12)}`;

/** Entry point for every Telegram update the webhook receives. */
export async function handleTelegramUpdate(update: any, deps: BotDeps): Promise<void> {
  if (update?.callback_query) return handleButton(update.callback_query, deps);

  const message = update?.message;
  if (!message?.chat?.id) return;
  if (message.chat.type !== 'private') return; // the bot only works in your own private chat
  const hasFile = Boolean(message.photo?.length || message.document);
  if (!message.text && !hasFile) return;

  const chatId = String(message.chat.id);
  const [rawCommand, ...args] = String(message.text ?? '').trim().split(/\s+/);
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

  if (command === '/month') {
    const asked = args[0];
    if (asked && !isMonth(asked)) {
      await reply('Usage: /month for last month, or /month 2026-10');
      return;
    }
    const { data: wsRows } = await admin.from('workspaces').select('*').in('id', workspaceIds);
    for (const ws of (wsRows ?? []).map((r) => fromRow<Workspace>(r))) {
      const rate = ws.exchangeRates?.ETB_per_USD || 155;
      const input = await loadMonthlyInput(admin, ws.id, rate);
      if (!input) {
        await reply('Payments are not set up yet (run 0003_payments.sql in Supabase).');
        continue;
      }
      const today = localDateAndHour(deps.now ?? new Date(), ws.timezone || 'UTC').date;
      const month = asked ?? shiftMonth(today.slice(0, 7), -1);
      const msg = buildMonthlyMessage(summarizeMonth(input, month), ws.name, { includeUpcoming: !asked });
      await reply(msg.html);
    }
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

  const forwarded = Boolean(message.forward_origin || message.forward_date);
  if (hasFile || (message.text && looksLikeReceiptText(message.text, forwarded))) {
    await handleReceiptMessage(message, chatId, workspaceIds[0], deps);
    return;
  }

  await reply(HELP_TEXT);
}

/**
 * A receipt sent to the bot: stored privately, read (Claude, if configured), matched to a service,
 * then answered with ✅ Save / ✏️ Edit in app / 🗑 Ignore. Reading runs after Telegram gets its reply.
 */
async function handleReceiptMessage(message: any, chatId: string, workspaceId: string, deps: BotDeps): Promise<void> {
  const { admin } = deps;
  const answer = (text: string, reply_markup?: InlineKeyboard) =>
    deps.tg('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_parameters: { message_id: message.message_id, allow_sending_without_reply: true },
      ...(reply_markup ? { reply_markup } : {}),
    });

  let file: { fileId: string; mimeType: string; name: string; size?: number } | undefined;
  if (message.photo?.length) {
    const biggest = message.photo[message.photo.length - 1];
    file = { fileId: biggest.file_id, mimeType: 'image/jpeg', name: 'photo.jpg', size: biggest.file_size };
  } else if (message.document) {
    const mimeType = receiptMimeType(message.document.mime_type, message.document.file_name);
    if (!mimeType) {
      await answer('I can read photos, PDFs and text receipts. Send it as one of those.');
      return;
    }
    file = { fileId: message.document.file_id, mimeType, name: String(message.document.file_name || 'receipt').slice(0, 200), size: message.document.file_size };
  }
  if (file?.size && file.size > MAX_RECEIPT_BYTES) {
    await answer('That file is over 10 MB. Send a smaller photo or PDF.');
    return;
  }
  if (file && !deps.download) {
    await answer('Receiving files is not available right now.');
    return;
  }

  const id = `rcpt-tg-${chatId}-${message.message_id}`;
  const created = await createReceipt(admin, {
    id,
    workspace_id: workspaceId,
    channel: 'telegram',
    status: 'reading',
    text_content: file ? null : String(message.text).slice(0, 100_000),
    mime_type: file?.mimeType ?? null,
    original_name: file?.name ?? null,
    size_bytes: file?.size ?? null,
    telegram_chat_id: chatId,
    telegram_message_id: message.message_id,
    extracted: {},
  });
  if (created === 'duplicate') return; // Telegram redelivered the same message

  await deps.tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => undefined);

  const work = async () => {
    try {
      const receipt = await loadReceipt(admin, id);
      if (!receipt) return;
      let bytes: Uint8Array | undefined;
      if (file) {
        bytes = await deps.download!(file.fileId, MAX_RECEIPT_BYTES);
        await storeReceiptFile(admin, receipt, bytes, file.mimeType);
      }
      const today = await workspaceToday(admin, workspaceId, deps.now);
      const done = await processReceipt(admin, receipt, { bytes, note: message.caption }, today);
      const { data: ws } = await admin.from('workspaces').select('exchange_rates').eq('id', workspaceId).maybeSingle();
      const rate = Number((ws as { exchange_rates?: { ETB_per_USD?: number } } | null)?.exchange_rates?.ETB_per_USD) || 155;
      const msg = buildReceiptReply({
        receiptId: id,
        details: done.receipt.extracted,
        day: today,
        serviceName: done.service?.providerName,
        sourceName: done.source?.name,
        planText: done.planText,
        etbPerUsd: rate,
        appUrl: deps.appUrl,
        unreadReason: !done.read.details ? done.read.message : undefined,
      });
      await answer(msg.text, msg.reply_markup);
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      await markReceiptFailed(admin, id, why);
      await answer(`⚠️ Couldn't save that receipt: ${escapeHtml(why)}`).catch(() => undefined);
    }
  };
  if (deps.defer) deps.defer(work);
  else await work();
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
  if (action.kind === 'rok' || action.kind === 'rno') {
    const receipt = await loadReceipt(deps.admin, action.itemId, workspaceIds);
    const today = receipt ? await workspaceToday(deps.admin, receipt.workspaceId, deps.now) : '';
    result =
      action.kind === 'rok'
        ? await confirmReceiptOnServer(deps.admin, action.itemId, workspaceIds, today)
        : await ignoreReceiptOnServer(deps.admin, action.itemId, workspaceIds);
  } else if (action.kind === 'paid') {
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

  await admin.from('payments').upsert(
    {
      id: renewalPaymentId(id, due),
      workspace_id: row.workspace_id,
      service_link_id: id,
      source_id: row.payment_source_id ?? null,
      paid_on: today,
      amount: Number(row.cost) || 0,
      currency: row.currency || 'USD',
      origin: 'telegram',
      note: `Renewal due ${due}`,
    },
    { onConflict: 'id', ignoreDuplicates: true }
  );
  await audit(admin, row.workspace_id, 'serviceLink', id, 'update', `Marked ${row.provider_name} paid via Telegram: ${due} → ${next}`);
  return { ok: true, note: `Paid · next ${next}` };
}
