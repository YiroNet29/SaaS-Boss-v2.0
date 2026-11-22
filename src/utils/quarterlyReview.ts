/**
 * The quarterly "still using it?" check: in the first week of each quarter, one Telegram message lists
 * the services you pay for, each with ✅ Keep and 🛑 Cancel. Pure functions, unit-tested.
 */
import type { ServiceLink } from '../types';
import { calculateMonthlyCost } from './cost';
import { encodeAction, escapeHtml, formatDualAmount, type InlineButton, type ReminderMessage } from './telegramUi';

/** "2026-Q4" and the quarter's first day. */
export function quarterOf(day: string): { key: string; start: string } {
  const year = Number(day.slice(0, 4));
  const q = Math.floor((Number(day.slice(5, 7)) - 1) / 3);
  return { key: `${year}-Q${q + 1}`, start: `${year}-${String(q * 3 + 1).padStart(2, '0')}-01` };
}

/** Asked during the first 7 days of a quarter (so one missed hourly run doesn't skip a quarter). */
export const reviewWeek = (day: string) => ['01', '04', '07', '10'].includes(day.slice(5, 7)) && Number(day.slice(8, 10)) <= 7;

export const MAX_REVIEW_ITEMS = 15;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

type ReviewService = Pick<ServiceLink, 'id' | 'productId' | 'providerName' | 'plan' | 'cost' | 'currency' | 'billingCycle' | 'status'>;

/** What's worth asking about: active services that cost something and repeat, priciest first. */
export function servicesToReview<T extends ReviewService>(services: T[], etbPerUsd: number): T[] {
  const monthlyUsd = (s: T) => {
    const m = calculateMonthlyCost(s.cost, s.billingCycle);
    return s.currency === 'ETB' ? m / etbPerUsd : m;
  };
  return services
    .filter((s) => s.status === 'active' && s.cost > 0 && (s.billingCycle === 'monthly' || s.billingCycle === 'yearly'))
    .sort((a, b) => monthlyUsd(b) - monthlyUsd(a) || a.providerName.localeCompare(b.providerName));
}

export function buildReviewMessage(opts: {
  workspaceName: string;
  services: ReviewService[];
  productNames: Map<string, string>;
  etbPerUsd: number;
  quarterStart: string;
}): ReminderMessage & { plain: string[] } {
  const shown = opts.services.slice(0, MAX_REVIEW_ITEMS);
  const lines: string[] = [
    `🧹 <b>Quarterly check · ${escapeHtml(opts.workspaceName)}</b>`,
    '',
    'Still using these? Tap ✅ Keep or 🛑 Cancel for each one. Nothing changes until you tap.',
  ];
  const plain: string[] = [];
  const keyboard: InlineButton[][] = [];
  shown.forEach((s, i) => {
    const n = i + 1;
    // Clipped, so 15 long names still fit Telegram's 4096-character limit.
    const name = clip(s.plan ? `${s.providerName} (${s.plan})` : s.providerName, 60);
    const app = clip(opts.productNames.get(s.productId) ?? '', 40);
    const every = s.billingCycle === 'yearly' ? 'a year' : 'a month';
    const money = formatDualAmount(s.cost, s.currency, opts.etbPerUsd);
    lines.push('', `${n}. <b>${escapeHtml(name)}</b>${app ? ` · ${escapeHtml(app)}` : ''}`, `    ${money} ${every}`);
    plain.push(`${name}${app ? ` · ${app}` : ''}: ${money} ${every}`);
    const keep = encodeAction('keep', s.id, opts.quarterStart);
    const stop = encodeAction('stop', s.id, opts.quarterStart);
    if (keep && stop) keyboard.push([{ text: `✅ Keep #${n}`, callback_data: keep }, { text: `🛑 Cancel #${n}`, callback_data: stop }]);
  });
  if (opts.services.length > shown.length) {
    lines.push('', `…and ${opts.services.length - shown.length} smaller ones in the app.`);
  }
  // The "Open StackTrack" link is added by whoever sends it (deliverLines), for Telegram and email alike.
  return { text: lines.join('\n'), reply_markup: keyboard.length ? { inline_keyboard: keyboard } : undefined, plain };
}
