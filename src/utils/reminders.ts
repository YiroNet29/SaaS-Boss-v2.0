import { RecurrenceType, ReminderLog } from '../types';

/**
 * Calculates calendar day difference between target date and today.
 * Positive number = days until due.
 * 0 = due today.
 * Negative number = days overdue.
 */
export function getDaysDiff(todayStr: string, targetDateStr: string): number {
  if (!targetDateStr) return 9999;
  const today = new Date(todayStr.slice(0, 10) + 'T00:00:00Z');
  const target = new Date(targetDateStr.slice(0, 10) + 'T00:00:00Z');
  const diffTime = target.getTime() - today.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

export interface ReminderCandidate {
  itemId: string;
  itemType: 'serviceLink' | 'importantDate';
  title: string;
  dueDate: string;
  leadDays: number[];
}

export interface ReminderDecision {
  shouldSend: boolean;
  reason: 'lead_day_match' | 'overdue_daily' | 'overdue_weekly' | 'none';
  matchedLeadDay?: number;
  daysDiff: number;
}

/**
 * Determines whether a reminder should be dispatched today.
 * - For upcoming items: matches if daysDiff is in leadDays and hasn't been sent yet for that leadDay.
 * - For overdue items: re-sents daily for 3 days (day 1, 2, 3 overdue), then weekly (day 7, 14, 21, ...).
 */
export function evaluateReminder(
  candidate: ReminderCandidate,
  todayStr: string,
  existingLogs: ReminderLog[],
  channel: 'email' | 'telegram'
): ReminderDecision {
  const daysDiff = getDaysDiff(todayStr, candidate.dueDate);

  // Check logs for this specific item and channel
  const itemLogs = existingLogs.filter(
    (l) => l.itemId === candidate.itemId && l.channel === channel && l.status === 'sent'
  );

  // Case 1: Upcoming or Due Today (daysDiff >= 0)
  if (daysDiff >= 0) {
    // Is today exactly one of the designated lead days?
    const matchedLeadDay = candidate.leadDays.find((d) => d === daysDiff);
    if (matchedLeadDay !== undefined) {
      // Check if we already sent for this leadDay
      const alreadySent = itemLogs.some((l) => l.leadDay === matchedLeadDay);
      if (!alreadySent) {
        return {
          shouldSend: true,
          reason: 'lead_day_match',
          matchedLeadDay,
          daysDiff,
        };
      }
    }
    return { shouldSend: false, reason: 'none', daysDiff };
  }

  // Case 2: Overdue (daysDiff < 0)
  const daysOverdue = Math.abs(daysDiff);

  // Have we already sent an overdue alert today?
  const sentToday = itemLogs.some((l) => l.sentAt.slice(0, 10) === todayStr.slice(0, 10));
  if (sentToday) {
    return { shouldSend: false, reason: 'none', daysDiff };
  }

  // Overdue rule: daily for 3 days (daysOverdue 1, 2, 3), then weekly (multiples of 7: 7, 14, 21...)
  if (daysOverdue <= 3) {
    return {
      shouldSend: true,
      reason: 'overdue_daily',
      matchedLeadDay: -daysOverdue,
      daysDiff,
    };
  }

  if (daysOverdue % 7 === 0) {
    return {
      shouldSend: true,
      reason: 'overdue_weekly',
      matchedLeadDay: -daysOverdue,
      daysDiff,
    };
  }

  return { shouldSend: false, reason: 'none', daysDiff };
}

/**
 * Computes next recurring date when an important date is completed.
 */
export function computeNextRecurringDate(
  currentDueDate: string,
  recurrence: RecurrenceType,
  customDays?: number
): string | null {
  if (recurrence === 'none') return null;

  const date = new Date(currentDueDate.slice(0, 10) + 'T00:00:00Z');

  switch (recurrence) {
    case 'monthly':
      date.setUTCMonth(date.getUTCMonth() + 1);
      break;
    case 'quarterly':
      date.setUTCMonth(date.getUTCMonth() + 3);
      break;
    case 'yearly':
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      break;
    case 'custom days':
      if (customDays && customDays > 0) {
        date.setUTCDate(date.getUTCDate() + customDays);
      } else {
        return null;
      }
      break;
    default:
      return null;
  }

  return date.toISOString().slice(0, 10);
}

/**
 * Computes snoozed date given current date and days to snooze.
 */
export function computeSnoozeDate(baseDateStr: string, snoozeDays: number): string {
  const d = new Date(baseDateStr.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Math.max(1, snoozeDays));
  return d.toISOString().slice(0, 10);
}

/**
 * Snooze target date. Counts from today when the item is already due or overdue, so snoozing
 * an overdue item actually moves it into the future.
 */
export function snoozeUntil(currentDue: string | undefined, today: string, days: number): string {
  const base = currentDue && currentDue.slice(0, 10) > today ? currentDue : today;
  return computeSnoozeDate(base, days);
}
