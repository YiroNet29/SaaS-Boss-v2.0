import { test, expect } from '@playwright/test';
import { APP } from './ports';

// Request limits on the app's public addresses (src/lib/rate-limit.ts). Uses the expiry look-up route,
// which no other test calls, so its count doesn't get in their way.
test('too many requests in a minute get "429 Too many requests" with a wait time', async () => {
  const statuses: number[] = [];
  let last: Response | null = null;
  for (let i = 0; i < 31; i++) {
    last = await fetch(`${APP}/api/expiry/check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    statuses.push(last.status);
  }
  expect(statuses.slice(0, 30).every((s) => s !== 429), `first 30 answers: ${statuses.slice(0, 30).join(',')}`).toBe(true);
  expect(statuses[30]).toBe(429);
  expect(Number(last!.headers.get('retry-after'))).toBeGreaterThan(0);
  expect((await last!.json()).error).toMatch(/Too many requests/);
});
