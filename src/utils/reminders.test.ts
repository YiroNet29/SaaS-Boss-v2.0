import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDaysDiff,
  evaluateReminder,
  computeNextRecurringDate,
  computeSnoozeDate,
  ReminderCandidate,
} from './reminders';
import { ReminderLog } from '../types';

test('getDaysDiff correctly identifies future, today, and past dates', () => {
  assert.equal(getDaysDiff('2026-10-23', '2026-10-30'), 7);
  assert.equal(getDaysDiff('2026-10-23', '2026-10-23'), 0);
  assert.equal(getDaysDiff('2026-10-23', '2026-10-20'), -3);
});

test('evaluateReminder sends on lead day and dedupes on duplicate execution', () => {
  const today = '2026-10-23';
  const candidate: ReminderCandidate = {
    itemId: 'date-1',
    itemType: 'importantDate',
    title: 'Domain Renewal',
    dueDate: '2026-10-30', // exactly 7 days away
    leadDays: [30, 14, 7, 1],
  };

  // With no prior logs, it should trigger for lead day 7
  const initialCheck = evaluateReminder(candidate, today, [], 'email');
  assert.equal(initialCheck.shouldSend, true);
  assert.equal(initialCheck.matchedLeadDay, 7);
  assert.equal(initialCheck.reason, 'lead_day_match');

  // Once recorded in reminderLog, identical check should be deduped
  const logsWithSent: ReminderLog[] = [
    {
      id: 'log-1',
      workspaceId: 'ws1',
      itemType: 'importantDate',
      itemId: 'date-1',
      channel: 'email',
      leadDay: 7,
      sentAt: '2026-10-23T08:00:00Z',
      status: 'sent',
    },
  ];

  const dedupedCheck = evaluateReminder(candidate, today, logsWithSent, 'email');
  assert.equal(dedupedCheck.shouldSend, false);
  assert.equal(dedupedCheck.reason, 'none');

  // Different channel (e.g. telegram) has not been sent yet
  const telegramCheck = evaluateReminder(candidate, today, logsWithSent, 'telegram');
  assert.equal(telegramCheck.shouldSend, true);
});

test('evaluateReminder handles overdue items: daily for 3 days, then weekly', () => {
  const today = '2026-10-23';

  // Item overdue by 2 days (dueDate 2026-10-21)
  const candidateDay2: ReminderCandidate = {
    itemId: 'date-2',
    itemType: 'importantDate',
    title: 'SSL Certificate',
    dueDate: '2026-10-21', // 2 days overdue
    leadDays: [7, 1],
  };

  const day2Result = evaluateReminder(candidateDay2, today, [], 'telegram');
  assert.equal(day2Result.shouldSend, true);
  assert.equal(day2Result.reason, 'overdue_daily');

  // Item overdue by 5 days: not sent because day 5 is past initial 3 days and not a multiple of 7
  const candidateDay5: ReminderCandidate = {
    itemId: 'date-5',
    itemType: 'importantDate',
    title: 'Invoice Due',
    dueDate: '2026-10-18', // 5 days overdue
    leadDays: [7, 1],
  };
  const day5Result = evaluateReminder(candidateDay5, today, [], 'telegram');
  assert.equal(day5Result.shouldSend, false);

  // Item overdue by 7 days: weekly reminder triggered!
  const candidateDay7: ReminderCandidate = {
    itemId: 'date-7',
    itemType: 'importantDate',
    title: 'Invoice Due',
    dueDate: '2026-10-16', // 7 days overdue
    leadDays: [7, 1],
  };
  const day7Result = evaluateReminder(candidateDay7, today, [], 'telegram');
  assert.equal(day7Result.shouldSend, true);
  assert.equal(day7Result.reason, 'overdue_weekly');
});

test('computeNextRecurringDate advances monthly, quarterly, yearly, and custom days', () => {
  const base = '2026-01-15';
  assert.equal(computeNextRecurringDate(base, 'none'), null);
  assert.equal(computeNextRecurringDate(base, 'monthly'), '2026-02-15');
  assert.equal(computeNextRecurringDate(base, 'quarterly'), '2026-04-15');
  assert.equal(computeNextRecurringDate(base, 'yearly'), '2027-01-15');
  assert.equal(computeNextRecurringDate(base, 'custom days', 45), '2026-03-01');
});

test('computeSnoozeDate adds the requested snooze duration', () => {
  assert.equal(computeSnoozeDate('2026-10-23', 7), '2026-10-30');
  assert.equal(computeSnoozeDate('2026-10-23', 1), '2026-10-24');
});
