import 'server-only';
import type { InlineKeyboard, ReminderMessage } from '../utils/telegramUi';

/** Overridable for tests (a fake Telegram server); defaults to the real Bot API. */
const apiBase = () => process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';

export const isTelegramConfigured = () => Boolean(process.env.TELEGRAM_BOT_TOKEN);

/**
 * Calls a Telegram Bot API method. Throws with Telegram's own description on failure.
 * The bot token is only ever placed in the request URL, never in errors or logs.
 */
export async function tg<T = unknown>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  const res = await fetch(`${apiBase()}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!res.ok || !body.ok) throw new Error(`Telegram ${method}: ${body.description || `HTTP ${res.status}`}`);
  return body.result as T;
}

/** Sends an HTML-formatted message, optionally with inline buttons. */
export function sendTelegramMessage(chatId: string | number, msg: ReminderMessage) {
  return tg('sendMessage', {
    chat_id: chatId,
    text: msg.text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(msg.reply_markup ? { reply_markup: msg.reply_markup } : {}),
  });
}

export function editTelegramButtons(chatId: string | number, messageId: number, markup: InlineKeyboard | undefined) {
  return tg('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: markup ?? { inline_keyboard: [] },
  });
}

/**
 * Downloads a file someone sent the bot (photo, PDF). Telegram serves bot files up to 20 MB;
 * receipts are capped lower by the caller.
 */
export async function downloadTelegramFile(fileId: string, maxBytes: number): Promise<Uint8Array> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  const file = await tg<{ file_path?: string; file_size?: number }>('getFile', { file_id: fileId });
  if (!file.file_path) throw new Error('Telegram did not return the file.');
  if ((file.file_size ?? 0) > maxBytes) throw new Error('The file is too large.');
  const res = await fetch(`${apiBase()}/file/bot${token}/${file.file_path}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Telegram file download failed (HTTP ${res.status}).`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error('The file is too large.');
  return bytes;
}

export const BOT_COMMANDS = [
  { command: 'due', description: 'Overdue and due in the next 30 days' },
  { command: 'week', description: 'Due in the next 7 days' },
  { command: 'help', description: 'What this bot can do' },
];

/** Telegram only accepts A-Z a-z 0-9 _ - (1-256 chars) as a webhook secret token. */
export const isValidWebhookSecret = (s: string | undefined) => !!s && /^[A-Za-z0-9_-]{1,256}$/.test(s);
