/**
 * Colours for status pills and dots on the Timeline and Portfolio dashboards. The pill pairs are the
 * ones the Classic dashboard's renewal badges use, so they stay readable in every theme.
 */
export type PillTone = 'auto' | 'usage' | 'manual' | 'date' | 'overdue' | 'free' | 'none' | 'ok' | 'warn' | 'bad';

const GREEN = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400';
const AMBER = 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400';
const ROSE = 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400';
const ACCENT = 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400';
const NEUTRAL = 'bg-slate-800 text-slate-300';

export const PILL: Record<PillTone, string> = {
  auto: GREEN,
  ok: GREEN,
  usage: AMBER,
  warn: AMBER,
  manual: ROSE,
  overdue: ROSE,
  bad: ROSE,
  date: ACCENT,
  free: NEUTRAL,
  none: NEUTRAL,
};

/** Dot and bar colours (shapes, not text). */
export const DOT: Record<'auto' | 'usage' | 'manual' | 'date' | 'ok' | 'warn' | 'bad', string> = {
  auto: 'bg-emerald-500',
  ok: 'bg-emerald-500',
  usage: 'bg-amber-500',
  warn: 'bg-amber-500',
  manual: 'bg-rose-500',
  bad: 'bg-rose-500',
  date: 'bg-indigo-500',
};
