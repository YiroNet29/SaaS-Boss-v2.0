/**
 * "/add Vercel Pro 20 USD monthly for StackTrack" → a new service. Pure parsing, unit-tested.
 *
 *   /add <name> <amount> [USD|ETB|birr] [monthly|yearly|once|usage] [YYYY-MM-DD] [for <app>]
 *   /add <name> free [for <app>]
 *
 * The words before the amount are the service; a last word like "Pro" or "Team" becomes its plan.
 * The date is the next renewal. Anything not understood is reported back instead of guessed.
 */
import type { BillingCycle, Currency } from '../types';
import { escapeHtml } from './telegramUi';

export interface AddDraft {
  providerName: string;
  plan: string;
  cost: number;
  currency: Currency;
  billingCycle: BillingCycle;
  renewalDate?: string;
  /** The app named after "for" / "in", if any. */
  appName?: string;
}

export type AddParse = { ok: true; draft: AddDraft } | { ok: false; error: string };

export const ADD_EXAMPLE = '/add Vercel Pro 20 USD monthly for StackTrack';
export const ADD_USAGE =
  'Usage: <code>/add &lt;name&gt; &lt;amount&gt; [USD or ETB] [monthly, yearly, once] [renewal date] [for &lt;app&gt;]</code>\n' +
  `For example: <code>${ADD_EXAMPLE}</code>`;

const PLAN_WORDS = new Set([
  'pro', 'plus', 'team', 'teams', 'business', 'starter', 'basic', 'premium', 'hobby', 'enterprise',
  'personal', 'standard', 'growth', 'scale', 'launch', 'essentials', 'professional', 'individual',
]);

const CURRENCY_WORDS: Record<string, Currency | 'other'> = {
  usd: 'USD', $: 'USD', dollar: 'USD', dollars: 'USD',
  etb: 'ETB', birr: 'ETB', br: 'ETB',
  eur: 'other', '€': 'other', gbp: 'other', '£': 'other',
};

const CYCLE_WORDS: Record<string, BillingCycle> = {
  monthly: 'monthly', month: 'monthly', mo: 'monthly', '/mo': 'monthly', '/month': 'monthly', pm: 'monthly',
  yearly: 'yearly', year: 'yearly', annual: 'yearly', annually: 'yearly', yr: 'yearly', '/yr': 'yearly', '/year': 'yearly',
  once: 'one-time', 'one-time': 'one-time', onetime: 'one-time', lifetime: 'one-time',
  usage: 'usage-based', 'usage-based': 'usage-based', metered: 'usage-based',
};

/** Filler words that may sit between the parts ("20 USD per month, renews 2026-12-01"). */
const FILLER = new Set(['a', 'per', 'every', '/', 'renews', 'renewal', 'next', 'on', 'due', 'at', '-']);

/** Words that can stand in for the price: "/add Cloudflare free", "/add OpenAI usage". */
const ANCHOR_WORDS = new Set(['free', 'usage', 'usage-based', 'metered']);

const AMOUNT = /^([$€£])?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?([$€£])?$/;

function readAmount(token: string): { value: number; symbol?: string } | null {
  const m = AMOUNT.exec(token);
  if (!m) return null;
  const value = Number(`${m[2].replace(/,/g, '')}${m[3] ? `.${m[3]}` : ''}`);
  return Number.isFinite(value) ? { value, symbol: m[1] || m[4] } : null;
}

const isRealDay = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** Parses what follows "/add". */
export function parseAddCommand(args: string): AddParse {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { ok: false, error: ADD_USAGE };

  // The app name: everything after the first standalone "for" / "in" that comes after the amount, so an
  // app may have "for" or "in" in its own name ("for Built in Public").
  let at = tokens.findIndex((t) => readAmount(t) || ANCHOR_WORDS.has(t.toLowerCase()));
  if (at < 0) return { ok: false, error: `I need the price, for example 20, free or usage.\n${ADD_USAGE}` };
  // "Office 365 Business 12 monthly": while a later number comes before any keyword (currency, how often,
  // date, "for"), the earlier numbers are part of the name and the later one is the price.
  const keyword = (t: string) => {
    const w = t.toLowerCase();
    return Boolean(CURRENCY_WORDS[w] || CYCLE_WORDS[w] || FILLER.has(w) || ANCHOR_WORDS.has(w) || w === 'for' || w === 'in' || isRealDay(w));
  };
  if (at > 0 && readAmount(tokens[at])) {
    for (let j = at + 1; j < tokens.length && !keyword(tokens[j]); j++) if (readAmount(tokens[j])) at = j;
  }
  let appName: string | undefined;
  let end = tokens.length;
  for (let i = at + 1; i < tokens.length; i++) {
    const w = tokens[i].toLowerCase();
    if (w === 'for' || w === 'in') {
      appName = tokens.slice(i + 1).join(' ').trim();
      end = i;
      break;
    }
  }
  if (appName === '') return { ok: false, error: 'Say which app after "for", or leave "for" out.' };

  let nameTokens = tokens.slice(0, at);
  let currency: Currency | undefined;
  // "ETB 3900": a currency word just before the amount belongs to the amount.
  const before = nameTokens.at(-1)?.toLowerCase();
  if (before && CURRENCY_WORDS[before] && nameTokens.length > 1) {
    if (CURRENCY_WORDS[before] === 'other') return { ok: false, error: 'Prices are kept in USD or ETB. Convert it first.' };
    currency = CURRENCY_WORDS[before] as Currency;
    nameTokens = nameTokens.slice(0, -1);
  }
  const fullName = nameTokens.join(' ').trim();
  if (!fullName) return { ok: false, error: `Put the service name first.\n${ADD_USAGE}` };

  let cost = 0;
  let billingCycle: BillingCycle | undefined;
  if (ANCHOR_WORDS.has(tokens[at].toLowerCase())) {
    billingCycle = CYCLE_WORDS[tokens[at].toLowerCase()] ?? 'free';
  } else {
    const amount = readAmount(tokens[at])!;
    if (amount.symbol && amount.symbol !== '$') return { ok: false, error: 'Prices are kept in USD or ETB. Convert it first.' };
    if (amount.symbol === '$') currency = 'USD';
    cost = amount.value;
    if (cost > 10_000_000) return { ok: false, error: 'That amount looks too big. Check it and send it again.' };
  }

  let renewalDate: string | undefined;
  const unknown: string[] = [];
  for (const raw of tokens.slice(at + 1, end)) {
    const w = raw.toLowerCase().replace(/[.,;]+$/, '');
    if (!w || FILLER.has(w)) continue;
    if (CURRENCY_WORDS[w]) {
      if (CURRENCY_WORDS[w] === 'other') return { ok: false, error: 'Prices are kept in USD or ETB. Convert it first.' };
      currency = CURRENCY_WORDS[w] as Currency;
    } else if (CYCLE_WORDS[w]) {
      billingCycle = CYCLE_WORDS[w];
    } else if (w === 'free') {
      billingCycle = 'free';
    } else if (isRealDay(w)) {
      renewalDate = w;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(w)) {
      return { ok: false, error: `${escapeHtml(raw)} isn't a real date. Use YYYY-MM-DD, for example 2026-12-01.` };
    } else {
      unknown.push(raw);
    }
  }
  if (unknown.length) {
    // Replies are Telegram HTML: a stray "<" in what was typed would make Telegram refuse the reply.
    return { ok: false, error: `I didn't understand: ${escapeHtml(unknown.join(' '))}\n${ADD_USAGE}` };
  }
  if (billingCycle === 'free') cost = 0;
  if (cost === 0 && !billingCycle) billingCycle = 'free';

  // "Vercel Pro" → Vercel, plan Pro.
  const words = fullName.split(' ');
  let providerName = fullName;
  let plan = '';
  if (words.length > 1 && PLAN_WORDS.has(words.at(-1)!.toLowerCase())) {
    plan = words.at(-1)!;
    providerName = words.slice(0, -1).join(' ');
  }

  return {
    ok: true,
    draft: {
      providerName: providerName.slice(0, 80),
      plan: plan.slice(0, 40),
      cost,
      currency: currency ?? 'USD',
      billingCycle: billingCycle ?? 'monthly',
      ...(renewalDate ? { renewalDate } : {}),
      ...(appName ? { appName: appName.slice(0, 80) } : {}),
    },
  };
}

/** The app a name points to: exact name first, then a unique start, then a unique part. */
export function pickApp<T extends { id: string; name: string }>(apps: T[], name: string): T | 'none' | T[] {
  const q = name.trim().toLowerCase();
  const exact = apps.filter((a) => a.name.trim().toLowerCase() === q);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return exact;
  const starts = apps.filter((a) => a.name.trim().toLowerCase().startsWith(q));
  if (starts.length === 1) return starts[0];
  if (starts.length > 1) return starts;
  const part = apps.filter((a) => a.name.trim().toLowerCase().includes(q));
  if (part.length === 1) return part[0];
  return part.length > 1 ? part : 'none';
}

/** App-choice button payload: "add|<appId>|<message id of the /add>". At most 64 bytes. */
export function encodeAddChoice(appId: string, messageId: number): string | null {
  const data = `add|${appId}|${messageId}`;
  return new TextEncoder().encode(data).length <= 64 ? data : null;
}

export function parseAddChoice(data: unknown): { appId: string; messageId: number } | null {
  if (typeof data !== 'string') return null;
  const m = /^add\|([A-Za-z0-9_\-:.]{1,50})\|(\d{1,12})$/.exec(data);
  return m ? { appId: m[1], messageId: Number(m[2]) } : null;
}

const CYCLE_TEXT: Record<BillingCycle, string> = {
  monthly: 'a month',
  yearly: 'a year',
  'one-time': 'once',
  'usage-based': 'usage-based',
  free: 'free',
};

/** "Vercel (Pro) · $20 a month" */
export function describeDraft(d: Pick<AddDraft, 'providerName' | 'plan' | 'cost' | 'currency' | 'billingCycle'>, money: string): string {
  const name = d.plan ? `${d.providerName} (${d.plan})` : d.providerName;
  if (d.billingCycle === 'free') return `${name} · free`;
  if (d.billingCycle === 'usage-based') return `${name} · usage-based${d.cost ? `, about ${money}` : ''}`;
  return `${name} · ${money} ${CYCLE_TEXT[d.billingCycle]}`;
}
