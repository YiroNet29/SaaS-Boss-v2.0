/**
 * Telegram message layout and inline buttons. Pure functions (no network), unit-tested.
 * Messages use Telegram's HTML parse mode, so every piece of user text goes through escapeHtml.
 */
import type { DueCandidate } from './reminderDigest';
import { describeDays } from './reminderDigest';
import { formatCurrency } from './formatters';
import type { ReceiptDetails } from '../types';
import { isSavableCurrency, receiptHeadline } from './receipts';

export type ReminderItem = DueCandidate & { daysDiff: number };

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}
export interface InlineKeyboard {
  inline_keyboard: InlineButton[][];
}

/** Reminder buttons (done, snooze 3/7 days, paid) and receipt buttons (rok = save, rno = ignore). */
export type ActionKind = 'done' | 's3' | 's7' | 'paid' | 'rok' | 'rno';
const ACTION_KINDS: ActionKind[] = ['done', 's3', 's7', 'paid', 'rok', 'rno'];

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/**
 * Button payload: "kind|itemId|YYYYMMDD". The due date ties the button to one occurrence, so an old
 * button can't act twice (e.g. "Paid" on last month's message). Telegram allows at most 64 bytes.
 */
export function encodeAction(kind: ActionKind, itemId: string, dueDate: string): string | null {
  const data = `${kind}|${itemId}|${dueDate.slice(0, 10).replace(/-/g, '')}`;
  return new TextEncoder().encode(data).length <= 64 ? data : null;
}

export function parseAction(data: unknown): { kind: ActionKind; itemId: string; due: string } | null {
  if (typeof data !== 'string') return null;
  const m = /^([a-z0-9]+)\|([A-Za-z0-9_\-:.]{1,60})\|(\d{4})(\d{2})(\d{2})$/.exec(data);
  if (!m || !ACTION_KINDS.includes(m[1] as ActionKind)) return null;
  return { kind: m[1] as ActionKind, itemId: m[2], due: `${m[3]}-${m[4]}-${m[5]}` };
}

/** Which buttons an item gets. Auto-renewing services and trial-end notices need none. */
export function actionsFor(item: Pick<DueCandidate, 'itemType' | 'itemId' | 'autoRenew'>): { kind: ActionKind; label: string }[] {
  if (item.itemType === 'importantDate') {
    return [
      { kind: 'done', label: '✅ Done' },
      { kind: 's3', label: '😴 3d' },
      { kind: 's7', label: '😴 7d' },
    ];
  }
  if (item.itemId.includes(':') || item.autoRenew) return [];
  return [{ kind: 'paid', label: '✅ Paid' }];
}

/** "$20 (≈ ETB 3,148)" or "ETB 3,900 (≈ $25)". */
export function formatDualAmount(amount: number | undefined, currency: 'USD' | 'ETB' | undefined, etbPerUsd: number): string {
  if (!amount || !currency) return '';
  if (currency === 'USD') return `${formatCurrency(amount, 'USD')} (≈ ${formatCurrency(Math.round(amount * etbPerUsd), 'ETB')})`;
  return `${formatCurrency(amount, 'ETB')} (≈ ${formatCurrency(Math.round(amount / etbPerUsd), 'USD')})`;
}

function itemLine(n: number, item: ReminderItem, etbPerUsd: number): string {
  const amount = formatDualAmount(item.amount, item.currency, etbPerUsd);
  return (
    `${n}. <b>${escapeHtml(clip(item.title, 70))}</b> · ${escapeHtml(clip(item.productName, 40))}\n` +
    `    ${describeDays(item.daysDiff)} (${item.dueDate.slice(0, 10)})${amount ? ` · ${amount}` : ''}`
  );
}

export interface ReminderMessage {
  text: string;
  reply_markup?: InlineKeyboard;
}

/**
 * The reminder / digest message: overdue first, then upcoming, numbered, with one button row per
 * actionable item ("✅ Done #2", "😴 3d", "😴 7d").
 */
export function buildReminderMessage(opts: {
  workspaceName: string;
  items: ReminderItem[];
  etbPerUsd: number;
  appUrl?: string;
  heading?: string;
  maxItems?: number;
}): ReminderMessage {
  const { workspaceName, etbPerUsd, appUrl } = opts;
  const max = opts.maxItems ?? 15;
  const sorted = [...opts.items].sort((a, b) => a.daysDiff - b.daysDiff);
  const shown = sorted.slice(0, max);
  const overdue = shown.filter((i) => i.daysDiff < 0);
  const upcoming = shown.filter((i) => i.daysDiff >= 0);

  const lines: string[] = [`🔔 <b>${escapeHtml(opts.heading ?? `StackTrack · ${workspaceName}`)}</b>`];
  const keyboard: InlineButton[][] = [];
  let n = 0;
  const addGroup = (title: string, group: ReminderItem[]) => {
    if (!group.length) return;
    lines.push('', title);
    for (const item of group) {
      n++;
      lines.push(itemLine(n, item, etbPerUsd));
      const row: InlineButton[] = [];
      actionsFor(item).forEach((a, idx) => {
        const data = encodeAction(a.kind, item.itemId, item.dueDate);
        if (data) row.push({ text: idx === 0 ? `${a.label} #${n}` : a.label, callback_data: data });
      });
      if (row.length) keyboard.push(row);
    }
  };
  addGroup('⚠️ <b>Overdue</b>', overdue);
  addGroup('📅 <b>Coming up</b>', upcoming);

  if (sorted.length > shown.length) lines.push('', `…and ${sorted.length - shown.length} more in the app.`);

  // Money due within a week (overdue included), in both currencies.
  const weekUsd = sorted
    .filter((i) => i.daysDiff <= 7 && i.amount && i.currency)
    .reduce((sum, i) => sum + (i.currency === 'ETB' ? i.amount! / etbPerUsd : i.amount!), 0);
  if (weekUsd > 0) {
    lines.push(
      '',
      `💵 Due within 7 days: <b>${formatCurrency(Math.round(weekUsd * 100) / 100, 'USD')}</b> ≈ ${formatCurrency(
        Math.round(weekUsd * etbPerUsd),
        'ETB'
      )}`
    );
  }
  if (appUrl) lines.push('', `<a href="${escapeHtml(appUrl)}">Open StackTrack</a>`);

  return { text: lines.join('\n'), reply_markup: keyboard.length ? { inline_keyboard: keyboard } : undefined };
}

/** After a button tap: replace that item's row with a single "✔ …" note. */
export function markItemHandled(markup: InlineKeyboard | undefined, itemId: string, note: string): InlineKeyboard | undefined {
  if (!markup?.inline_keyboard) return markup;
  const rows = markup.inline_keyboard.map((row) =>
    row.some((b) => parseAction(b.callback_data)?.itemId === itemId) ? [{ text: note, callback_data: 'noop' }] : row
  );
  return { inline_keyboard: rows };
}

/**
 * The bot's answer to a receipt: what was read, what it matched, and ✅ Save / ✏️ Edit in app / 🗑 Ignore.
 * Save only appears when there is enough to record a payment (an amount in USD or ETB).
 */
export function buildReceiptReply(opts: {
  receiptId: string;
  details: ReceiptDetails;
  /** Ingestion date, YYYY-MM-DD; ties the buttons to this receipt. */
  day: string;
  serviceName?: string;
  sourceName?: string;
  planText?: string;
  etbPerUsd: number;
  appUrl?: string;
  /** Why nothing was read (no AI key, unsupported file, error). */
  unreadReason?: string;
  /** Shown when the chat is linked to more than one workspace. */
  workspaceName?: string;
}): ReminderMessage {
  const { details: d, receiptId, day, etbPerUsd } = opts;
  const lines: string[] = [];
  const canSave = d.amount !== undefined && isSavableCurrency(d.currency);

  if (opts.unreadReason) {
    lines.push('🧾 <b>Receipt saved</b>', escapeHtml(opts.unreadReason));
  } else if (d.isReceipt === false) {
    lines.push("🧾 <b>That doesn't look like a receipt.</b>", 'It is in your Receipts inbox in case it is one.');
  } else {
    lines.push('🧾 <b>Receipt read</b>', `<b>${escapeHtml(receiptHeadline(d))}</b>`);
    if (canSave && d.currency !== undefined) {
      const dual = formatDualAmount(d.amount, d.currency as 'USD' | 'ETB', etbPerUsd);
      if (dual.includes('≈')) lines.push(escapeHtml(dual));
    } else if (d.amount !== undefined) {
      lines.push(`Amount is in ${escapeHtml(d.currency ?? 'an unknown currency')}: enter the USD or birr amount in the app.`);
    }
    if (d.summary) lines.push(escapeHtml(clip(d.summary, 120)));
    const paidWith = opts.sourceName ? escapeHtml(opts.sourceName) : d.cardLast4 ? `card •••• ${escapeHtml(d.cardLast4)}` : '';
    if (paidWith) lines.push(`Paid with: ${paidWith}`);
    lines.push(opts.serviceName ? `Looks like: <b>${escapeHtml(opts.serviceName)}</b>` : 'No matching service found.');
    if (canSave && opts.planText) lines.push(`✅ Save: ${escapeHtml(opts.planText)}`);
  }

  if (opts.workspaceName) lines.push(`Workspace: ${escapeHtml(opts.workspaceName)}`);

  const row: InlineButton[] = [];
  const save = canSave && !opts.unreadReason && d.isReceipt !== false ? encodeAction('rok', receiptId, day) : null;
  if (save) row.push({ text: '✅ Save', callback_data: save });
  if (opts.appUrl) row.push({ text: '✏️ Edit in app', url: `${opts.appUrl.replace(/\/$/, '')}/?tab=receipts` });
  const ignore = encodeAction('rno', receiptId, day);
  if (ignore) row.push({ text: '🗑 Ignore', callback_data: ignore });
  return { text: lines.join('\n'), reply_markup: row.length ? { inline_keyboard: [row] } : undefined };
}
