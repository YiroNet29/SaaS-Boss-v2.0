import 'server-only';
import { NextResponse } from 'next/server';
import { RateLimiter, clientAddress } from '@/utils/rateLimit';

/**
 * Requests allowed per minute from one address, per group of routes. Tight where a request costs money or
 * reaches out to another site; generous for cheap signed-in reads the app makes whenever a page opens.
 */
export const LIMITS = {
  cron: 30,
  webhook: 120, // Telegram's servers
  receipts: 20, // each read can call the Claude API
  expiry: 30, // each look-up reaches out to a registry or a website
  fx: 30, // reaches out to the exchange-rate services
  remindersTest: 10, // sends a real Telegram message or email
  passkeys: 60, // registering, unlocking (each also limited by failed attempts)
  passkeysList: 300,
  security: 120,
  telegram: 120, // the Settings card reads the bot's status when it opens
} as const;

const limiter = new RateLimiter();

/** A 429 answer when this address has made too many requests to `group` in the last minute; otherwise null. */
export function rateLimited(request: Request, group: keyof typeof LIMITS): NextResponse | null {
  const r = limiter.take(`${group}:${clientAddress(request.headers)}`, LIMITS[group], 60_000);
  if (r.ok) return null;
  return NextResponse.json(
    { error: 'Too many requests. Wait a minute and try again.' },
    { status: 429, headers: { 'Retry-After': String(r.retryAfterSec) } }
  );
}
