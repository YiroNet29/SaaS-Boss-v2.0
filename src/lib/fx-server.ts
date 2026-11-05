import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FX_SOURCES, isAutoRate, needsRateRefresh, type FxQuote } from '../utils/fx';
import type { WorkspaceExchangeRates } from '../types';

/** Fetches USD->ETB from the first source that answers with a sane value. Cached by Next for 6 hours. */
export async function fetchUsdEtbRate(): Promise<FxQuote> {
  const errors: string[] = [];
  for (const src of FX_SOURCES) {
    try {
      const res = await fetch(src.url, {
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 21600 },
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        errors.push(`${src.url}: HTTP ${res.status}`);
        continue;
      }
      const quote = src.parse(await res.json());
      if (quote) return quote;
      errors.push(`${src.url}: unexpected response`);
    } catch (err) {
      errors.push(`${src.url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`No exchange rate source answered. ${errors.join('; ')}`);
}

/** Cron step: refresh the rate on every workspace in auto mode whose rate is older than ~20 hours. */
export async function refreshAutoRates(
  admin: SupabaseClient,
  now = new Date()
): Promise<{ updated: number; rate?: number; source?: string; error?: string }> {
  const { data, error } = await admin.from('workspaces').select('id, exchange_rates');
  if (error) return { updated: 0, error: error.message };

  const due = (data ?? []).filter((w) => needsRateRefresh(w.exchange_rates as WorkspaceExchangeRates, now));
  if (!due.length) return { updated: 0 };

  let quote: FxQuote;
  try {
    quote = await fetchUsdEtbRate();
  } catch (err) {
    return { updated: 0, error: err instanceof Error ? err.message : String(err) };
  }

  let updated = 0;
  for (const w of due) {
    const current = (w.exchange_rates ?? {}) as WorkspaceExchangeRates;
    if (!isAutoRate(current)) continue;
    const next: WorkspaceExchangeRates = {
      ...current,
      ETB_per_USD: Math.round(quote.rate * 100) / 100,
      updatedAt: now.toISOString(),
      mode: 'auto',
      source: quote.source,
    };
    const { error: upErr } = await admin.from('workspaces').update({ exchange_rates: next }).eq('id', w.id);
    if (!upErr) updated++;
  }
  return { updated, rate: quote.rate, source: quote.source };
}
