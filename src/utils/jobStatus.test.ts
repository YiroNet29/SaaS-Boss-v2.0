import test from 'node:test';
import assert from 'node:assert/strict';
import { nextJobStatus, hourlyJobHealth, ago } from './jobStatus';

const NOW = '2026-11-22T10:00:00.000Z';

test('job status: a quiet run records the time and clears an old error', () => {
  const s = nextJobStatus({ hourlyRanAt: '2026-11-22T09:00:00.000Z', hourlyError: 'boom' }, undefined, NOW);
  assert.deepEqual(s, { hourlyRanAt: NOW });
});

test('job status: errors and Telegram results from reminders, money alerts and the monthly summary', () => {
  const s = nextJobStatus(undefined, { error: 'workspace not found' }, NOW);
  assert.equal(s.hourlyError, 'workspace not found');

  const sent = nextJobStatus(undefined, { workspaceId: 'w', telegram: 2 }, NOW);
  assert.equal(sent.telegramOkAt, NOW);
  assert.equal(sent.telegramFailedAt, undefined);

  const failed = nextJobStatus({ telegramOkAt: '2026-11-21T08:00:00.000Z' }, { telegramError: 'Telegram 403: bot was blocked by the user', email: 2 }, NOW);
  assert.equal(failed.telegramFailedAt, NOW);
  assert.match(failed.telegramError!, /blocked/);
  assert.equal(failed.telegramOkAt, '2026-11-21T08:00:00.000Z');

  const money = nextJobStatus(undefined, { money: { telegramError: 'fetch failed' } }, NOW);
  assert.equal(money.telegramError, 'fetch failed');
  const monthly = nextJobStatus(undefined, { monthly: { telegram: 1 } }, NOW);
  assert.equal(monthly.telegramOkAt, NOW);
});

test('job status: "not linked" is not a failure', () => {
  const s = nextJobStatus(undefined, { telegram: 'not linked', email: 'backup off' }, NOW);
  assert.equal(s.telegramFailedAt, undefined);
  assert.equal(s.telegramOkAt, undefined);
});

test('hourly job health: unknown, never, ok, late, stopped', () => {
  const now = new Date(NOW);
  assert.deepEqual(hourlyJobHealth(undefined, now), { health: 'unknown' });
  assert.deepEqual(hourlyJobHealth({}, now), { health: 'never' });
  assert.deepEqual(hourlyJobHealth({ hourlyRanAt: '2026-11-22T09:15:00.000Z' }, now), { health: 'ok', minutesAgo: 45 });
  assert.deepEqual(hourlyJobHealth({ hourlyRanAt: '2026-11-22T08:00:00.000Z' }, now), { health: 'late', minutesAgo: 120 });
  assert.deepEqual(hourlyJobHealth({ hourlyRanAt: '2026-11-22T06:30:00.000Z' }, now), { health: 'stopped', minutesAgo: 210 });
});

test('ago: plain words', () => {
  assert.equal(ago(0), 'just now');
  assert.equal(ago(1), '1 minute ago');
  assert.equal(ago(45), '45 minutes ago');
  assert.equal(ago(125), '2 hours ago');
  assert.equal(ago(60 * 50), '2 days ago');
});
