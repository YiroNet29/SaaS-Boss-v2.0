/**
 * USD -> ETB exchange rate helpers. Pure parsing/validation so they can be unit-tested;
 * the network calls live in src/lib/fx-server.ts.
 */
import type { WorkspaceExchangeRates } from '../types';

export interface FxQuote {
  rate: number; // ETB per 1 USD
  source: string;
  asOf: string; // ISO date the provider says the rate is from
}

/** Guards against a broken feed silently writing nonsense (the real rate is ~150-165 in 2026). */
export function isPlausibleEtbRate(rate: unknown): rate is number {
  return typeof rate === 'number' && Number.isFinite(rate) && rate >= 50 && rate <= 1000;
}

/** https://open.er-api.com/v6/latest/USD (ExchangeRate-API open access, daily, no key). */
export function parseErApi(json: any): FxQuote | null {
  if (json?.result !== 'success' || json?.base_code !== 'USD') return null;
  const rate = json?.rates?.ETB;
  if (!isPlausibleEtbRate(rate)) return null;
  const unix = Number(json.time_last_update_unix);
  return {
    rate,
    source: 'open.er-api.com',
    asOf: Number.isFinite(unix) && unix > 0 ? new Date(unix * 1000).toISOString() : new Date().toISOString(),
  };
}

/** fawazahmed0/exchange-api: { date: 'YYYY-MM-DD', usd: { etb: 155.1, ... } } (daily, no key). */
export function parseFawaz(json: any): FxQuote | null {
  const rate = json?.usd?.etb;
  if (!isPlausibleEtbRate(rate)) return null;
  const date = typeof json?.date === 'string' ? json.date : '';
  return {
    rate,
    source: 'currency-api (fawazahmed0)',
    asOf: /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00.000Z` : new Date().toISOString(),
  };
}

export const FX_SOURCES: { url: string; parse: (json: any) => FxQuote | null }[] = [
  { url: 'https://open.er-api.com/v6/latest/USD', parse: parseErApi },
  { url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', parse: parseFawaz },
  { url: 'https://latest.currency-api.pages.dev/v1/currencies/usd.json', parse: parseFawaz },
];

/** Workspaces default to automatic rates unless the owner chose to set the rate by hand. */
export const isAutoRate = (r?: WorkspaceExchangeRates) => r?.mode !== 'manual';

/** True when an auto-mode rate is missing or older than `maxAgeHours`. */
export function needsRateRefresh(r: WorkspaceExchangeRates | undefined, now: Date, maxAgeHours = 20): boolean {
  if (!isAutoRate(r)) return false;
  if (!r?.updatedAt || !r.source) return true; // never fetched automatically yet
  const age = now.getTime() - new Date(r.updatedAt).getTime();
  return !Number.isFinite(age) || age > maxAgeHours * 3600_000;
}
