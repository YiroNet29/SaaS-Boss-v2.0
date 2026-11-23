/**
 * What the hourly job (cron-job.org → /api/cron/reminders) last did for a workspace. Stored in
 * workspaces.job_status (migration 0006) by the server; shown in Settings → Status.
 */
export interface JobStatus {
  /** When the hourly job last ran (whatever it had to do). */
  hourlyRanAt?: string;
  /** This workspace's error on that run, if any. */
  hourlyError?: string;
  /** The last time a Telegram message reached you. */
  telegramOkAt?: string;
  /** The last time a Telegram message failed, and why. */
  telegramFailedAt?: string;
  telegramError?: string;
}

type Outcome = Record<string, unknown> | undefined;

/** Telegram results in one workspace's part of the hourly job's answer (reminders, money alerts, monthly summary). */
function telegramResults(result: Outcome): { ok: boolean; errors: string[] } {
  const parts = [result, result?.money as Outcome, result?.monthly as Outcome].filter(Boolean) as Record<string, unknown>[];
  const errors = parts.map((p) => p.telegramError).filter((e): e is string => typeof e === 'string' && e.length > 0);
  const ok = parts.some((p) => typeof p.telegram === 'number' && p.telegram > 0);
  return { ok, errors };
}

/** The status to store after a run. `result` is this workspace's part of the job's answer (absent if it had nothing to do). */
export function nextJobStatus(prev: JobStatus | undefined, result: Outcome, nowIso: string): JobStatus {
  const next: JobStatus = { ...(prev ?? {}), hourlyRanAt: nowIso };
  const error = typeof result?.error === 'string' ? result.error : typeof result?.logError === 'string' ? result.logError : undefined;
  if (error) next.hourlyError = error.slice(0, 300);
  else delete next.hourlyError;
  const tg = telegramResults(result);
  if (tg.ok) next.telegramOkAt = nowIso;
  if (tg.errors.length) {
    next.telegramFailedAt = nowIso;
    next.telegramError = tg.errors[0].slice(0, 300);
  }
  return next;
}

export type JobHealth = 'unknown' | 'never' | 'ok' | 'late' | 'stopped';

/**
 * How the hourly job is doing. `unknown`: no status stored (migration 0006 not run yet).
 * `never`: never ran. `ok`: ran within 90 minutes. `late`: within 3 hours. `stopped`: longer ago.
 */
export function hourlyJobHealth(status: JobStatus | undefined, now: Date): { health: JobHealth; minutesAgo?: number } {
  if (!status) return { health: 'unknown' };
  if (!status.hourlyRanAt) return { health: 'never' };
  const minutesAgo = Math.max(0, Math.round((now.getTime() - new Date(status.hourlyRanAt).getTime()) / 60000));
  if (minutesAgo < 90) return { health: 'ok', minutesAgo };
  if (minutesAgo < 180) return { health: 'late', minutesAgo };
  return { health: 'stopped', minutesAgo };
}

/** "just now", "12 minutes ago", "3 hours ago", "2 days ago". */
export function ago(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

export const minutesSince = (iso: string | undefined, now: Date): number | undefined =>
  iso ? Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000)) : undefined;
