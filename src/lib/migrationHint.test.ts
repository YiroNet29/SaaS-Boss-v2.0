import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationHint } from './db';

test('a save that needs migration 0007 says so; other errors are left alone', () => {
  assert.match(migrationHint("Could not find the 'monthly_budget' column of 'products' in the schema cache"), /0007_budgets_weekly\.sql/);
  assert.match(migrationHint('new row violates check constraint "notification_settings_digest_mode_check"'), /0007_budgets_weekly\.sql/);
  assert.equal(migrationHint('permission denied for table products'), 'permission denied for table products');
});
