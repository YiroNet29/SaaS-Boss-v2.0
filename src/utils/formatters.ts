import { Currency } from '../types';

/**
 * Formats a currency amount with standard symbols and thousands separators.
 * e.g., $1,250.00 or ETB 162,500.00
 */
export function formatCurrency(amount: number, currency: Currency): string {
  const safeAmount = isNaN(amount) ? 0 : amount;
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: safeAmount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  }

  // ETB format
  const formattedNumber = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: safeAmount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(safeAmount);

  return `ETB ${formattedNumber}`;
}

/**
 * Formats standard date string to friendly readable date.
 */
export function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.slice(0, 10).split('-');
    if (parts.length !== 3) return dateStr;
    const date = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Humanizes days difference into readable badge text.
 */
export function formatDaysDiff(daysDiff: number): { label: string; urgency: 'overdue' | 'urgent' | 'warning' | 'normal' } {
  if (daysDiff < 0) {
    const abs = Math.abs(daysDiff);
    return {
      label: abs === 1 ? '1 day overdue' : `${abs} days overdue`,
      urgency: 'overdue',
    };
  }
  if (daysDiff === 0) {
    return { label: 'Due today', urgency: 'urgent' };
  }
  if (daysDiff === 1) {
    return { label: 'Due tomorrow', urgency: 'urgent' };
  }
  if (daysDiff <= 7) {
    return { label: `In ${daysDiff} days`, urgency: 'warning' };
  }
  if (daysDiff <= 30) {
    return { label: `In ${daysDiff} days`, urgency: 'normal' };
  }
  return { label: `In ${daysDiff} days`, urgency: 'normal' };
}
