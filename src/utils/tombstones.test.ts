import test from 'node:test';
import assert from 'node:assert/strict';
import { Tombstones } from './tombstones';

test('tombstones: a row deleted here is remembered for a while, per table', () => {
  let now = 0;
  const t = new Tombstones(120_000, () => now);
  t.mark('payments', 'p1');
  assert.equal(t.has('payments', 'p1'), true);
  assert.equal(t.has('receipts', 'p1'), false);
  now += 119_000;
  assert.equal(t.has('payments', 'p1'), true);
  now += 2_000;
  assert.equal(t.has('payments', 'p1'), false);
});

test('tombstones: saving the same id again forgets it', () => {
  const t = new Tombstones();
  t.mark('payments', 'p1');
  t.forget('payments', 'p1');
  assert.equal(t.has('payments', 'p1'), false);
});
