import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter, clientAddress } from './rateLimit';

test('rate limit: allows up to the limit in the window, then refuses with a wait time', () => {
  let now = 1_000_000;
  const rl = new RateLimiter(() => now);
  for (let i = 0; i < 3; i++) assert.equal(rl.take('a', 3, 60_000).ok, true);
  const refused = rl.take('a', 3, 60_000);
  assert.equal(refused.ok, false);
  assert.equal(refused.retryAfterSec, 60);
  now += 30_000;
  assert.equal(rl.take('a', 3, 60_000).retryAfterSec, 30);
  // Other keys are counted separately.
  assert.equal(rl.take('b', 3, 60_000).ok, true);
  // Once the first requests are older than the window, new ones are allowed again.
  now += 30_001;
  assert.equal(rl.take('a', 3, 60_000).ok, true);
});

test('rate limit: memory stays bounded under a flood of new addresses', () => {
  let now = 0;
  const rl = new RateLimiter(() => now, 100);
  for (let i = 0; i < 1000; i++) {
    now += 1;
    rl.take(`ip-${i}`, 5, 60_000);
  }
  assert.ok(rl.size <= 101, `kept ${rl.size} keys`);
});

test('client address: first x-forwarded-for entry, then x-real-ip, then "local"', () => {
  const h = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });
  assert.equal(clientAddress(h({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })), '203.0.113.7');
  assert.equal(clientAddress(h({ 'x-real-ip': '198.51.100.2' })), '198.51.100.2');
  assert.equal(clientAddress(h({})), 'local');
});
