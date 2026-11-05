/**
 * Telegram message layout and inline buttons. Pure functions (no network), unit-tested.
 * Messages use Telegram's HTML parse mode, so every piece of user text goes through escapeHtml.
 */
import type { DueCandidate } from './reminderDigest';
import { describeDays } from './reminderDigest';
import { formatCurrency } from './formatters';

export type ReminderItem = DueCandidate & { daysDiff: number };

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}
export interface InlineKeyboard {
  inline_keyboard: InlineButton[][];
}

export type ActionKind = 'done' | 's3' | 's7' | 'paid';
const ACTION_KINDS: ActionKind[] = ['done', 's3', 's7', 'paid'];

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
