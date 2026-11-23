import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { AuditLogItem } from '../types';
import { appBudgetRows, historyEntries, historyTime, settingsSections, type SecurityEventRow } from './settingsPages';

describe('section menu', () => {
  test('every card in order; Status only in the live workspace, Demo data only in the demo', () => {
    assert.deepEqual(
      settingsSections(false).map((s) => s.label),
      ['Workspace', 'Money & rate', 'Reminders', 'Telegram', 'Email & timing', 'Look', 'Account & security', 'Status', 'History']
    );
    const demo = settingsSections(true).map((s) => s.label);
    assert.ok(!demo.includes('Status'));
    assert.equal(demo.at(-1), 'Demo data');
  });

  test('the Telegram entry points at the card the app scrolls to', () => {
    assert.equal(settingsSections(false).find((s) => s.label === 'Telegram')?.id, 'telegram-settings');
  });
});

describe('history', () => {
  const sec = (id: string, action: string, timestamp: string, changed_by = 'user'): SecurityEventRow => ({ id, action, details: '', changed_by, timestamp });
  const log = (id: string, action: AuditLogItem['action'], timestamp: string, details = '') => ({ id, action, details, timestamp, changedBy: 'user' });

  test('security events and changes in one list, newest first, each event once', () => {
    const list = historyEntries(
      [sec('a', 'sign_in', '2026-11-23T08:12:00Z'), sec('b', 'unlock_failed', '2026-11-21T10:30:00Z'), sec('t', 'telegram_linked', '2026-11-20T10:00:00Z', 'telegram')],
      [
        log('c', 'update', '2026-11-22T21:40:00Z', 'Supabase Pro: renewal date → Dec 12'),
        log('a', 'sign_in', '2026-11-23T08:12:00.000+00:00'),
      ]
    );
    assert.deepEqual(
      list.map((e) => [e.id, e.label, e.tone]),
      [
        ['a', 'Sign-in', 'ok'],
        ['c', '[update]', 'date'],
        ['b', 'Failed unlock', 'warn'],
        ['t', 'Telegram', 'ok'],
      ]
    );
    assert.equal(list[0].icon, '🔐');
    assert.equal(list[1].details, 'Supabase Pro: renewal date → Dec 12');
    assert.equal(list[3].viaTelegram, true);
  });

  test('keeps only the newest', () => {
    const many = Array.from({ length: 40 }, (_, i) => log(`l${i}`, 'update', `2026-11-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`));
    assert.equal(historyEntries([], many).length, 30);
    assert.equal(historyEntries([], many, 5).length, 5);
  });

  test('times read as today, this year, or with the year', () => {
    const now = new Date('2026-11-23T12:00:00Z');
    assert.equal(historyTime('2026-11-23T08:12:00Z', now, 'UTC'), 'Today 08:12');
    assert.equal(historyTime('2026-11-22T21:40:00Z', now, 'UTC'), 'Nov 22 21:40');
    assert.equal(historyTime('2025-12-30T09:00:00Z', now, 'UTC'), 'Dec 30, 2025 09:00');
    assert.equal(historyTime('not a date', now, 'UTC'), '');
  });
});

describe('per app budgets', () => {
  test('budget against this month, or none set', () => {
    const rows = appBudgetRows(
      [
        { id: 'a', name: 'StackTrack', monthlyBudget: 50 },
        { id: 'b', name: 'Addis Bites', monthlyBudget: 40 },
        { id: 'c', name: 'YG Retails', monthlyBudget: null },
      ],
      new Map([
        ['a', 34],
        ['b', 42],
        ['c', 7.2],
      ])
    );
    assert.deepEqual(
      rows.map((r) => [r.product.name, r.use?.percent ?? null, r.line.tone, r.spent]),
      [
        ['StackTrack', 68, 'ok', 34],
        ['Addis Bites', 105, 'bad', 42],
        ['YG Retails', null, 'none', 7.2],
      ]
    );
    assert.equal(rows[2].line.text, 'No budget set');
  });
});
