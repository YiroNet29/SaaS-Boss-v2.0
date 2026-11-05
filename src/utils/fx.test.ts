import test from 'node:test';
import assert from 'node:assert/strict';
import { isPlausibleEtbRate, needsRateRefresh, parseErApi, parseFawaz } from './fx';

test('parses the open.er-api.com response', () => {
  const q = parseErApi({
    result: 'success',
    base_code: 'USD',
    time_last_update_unix: 1793836801,
    rates: { USD: 1, ETB: 157.42, EUR: 0.86 },
  });
  assert.equal(q?.rate, 157.42);
  assert.equal(q?.source, 'open.er-api.com');
  assert.equal(q?.asOf, new Date(1793836801 * 1000).toISOString());
});

test('rejects error responses and nonsense rates', () => {
  assert.equal(parseErApi({ result: 'error', 'error-type': 'unsupported-code' }), null);
  assert.equal(parseErApi({ result: 'success', base_code: 'EUR', rates: { ETB: 170 } }), null);
  assert.equal(parseErApi({ result: 'success', base_code: 'USD', rates: { ETB: 0 } }), null);
  assert.equal(isPlausibleEtbRate(1.57), false);
  assert.equal(isPlausibleEtbRate(155), true);
});

test('parses the fawazahmed0 currency-api response', () => {
  const q = parseFawaz({ date: '2026-11-05', usd: { etb: 156.9, eur: 0.86 } });
  assert.deepEqual(q, { rate: 156.9, source: 'currency-api (fawazahmed0)', asOf: '2026-11-05T00:00:00.000Z' });
  assert.equal(parseFawaz({ usd: {} }), null);
});

test('needsRateRefresh: auto rates refresh daily, manual never', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  assert.equal(needsRateRefresh({ ETB_per_USD: 130, updatedAt: '2026-11-05T11:00:00Z' }, now), true, 'never auto-fetched');
  assert.equal(needsRateRefresh({ ETB_per_USD: 157, updatedAt: '2026-11-05T02:00:00Z', mode: 'auto', source: 'x' }, now), false);
  assert.equal(needsRateRefresh({ ETB_per_USD: 157, updatedAt: '2026-11-04T02:00:00Z', mode: 'auto', source: 'x' }, now), true);
  assert.equal(needsRateRefresh({ ETB_per_USD: 150, updatedAt: '2025-01-01T00:00:00Z', mode: 'manual' }, now), false);
});
