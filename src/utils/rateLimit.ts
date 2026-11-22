/**
 * A small sliding-window request counter, kept in memory. On Vercel each running copy of the server keeps
 * its own count, so this caps bursts rather than giving an exact global limit; that's enough for a
 * single-user app to stop a flood from running up costs (Claude API calls, outside look-ups).
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now, private readonly maxKeys = 5000) {}

  /** Counts one request for `key`. `ok: false` once `limit` requests arrived within `windowMs`. */
  take(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - t) / 1000)) };
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.sweep(windowMs);
    return { ok: true, retryAfterSec: 0 };
  }

  /** Forgets keys with nothing recent, so memory stays small. */
  private sweep(windowMs: number) {
    const t = this.now();
    for (const [k, v] of this.hits) if (!v.some((x) => t - x < windowMs)) this.hits.delete(k);
    // Still too many (a flood of new addresses): drop the oldest keys.
    while (this.hits.size > this.maxKeys) this.hits.delete(this.hits.keys().next().value as string);
  }

  get size() {
    return this.hits.size;
  }
}

/** The caller's address: the first entry of x-forwarded-for (set by Vercel, not the browser), else x-real-ip. */
export function clientAddress(headers: { get(name: string): string | null }): string {
  const fwd = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || headers.get('x-real-ip')?.trim() || 'local';
}
