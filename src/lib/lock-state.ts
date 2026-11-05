/**
 * Small per-device state for the app lock. Holds no secrets: just timestamps and preferences.
 * (Getting past the lock always needs a passkey, 2FA code or password checked by a server.)
 */
const ACTIVITY_KEY = 'stacktrack_last_active';
const VERIFIED_KEY = 'stacktrack_verified_at';
const LOCKED_KEY = 'stacktrack_locked';
const PREFS_KEY = 'stacktrack_lock_prefs';

export interface LockPrefs {
  /** Lock after this many minutes without use. */
  minutes: number;
  /** Also lock when you switch away from the app for more than a few seconds. */
  lockOnLeave: boolean;
}
export const DEFAULT_LOCK_PREFS: LockPrefs = { minutes: 15, lockOnLeave: false };
export const LOCK_MINUTE_OPTIONS = [5, 15, 30, 60];

const get = (store: 'local' | 'session', key: string): string | null => {
  try {
    return (store === 'local' ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
};
const set = (store: 'local' | 'session', key: string, value: string | null) => {
  try {
    const s = store === 'local' ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
};

export function readLockPrefs(): LockPrefs {
  try {
    const p = JSON.parse(get('local', PREFS_KEY) || 'null');
    if (p && LOCK_MINUTE_OPTIONS.includes(p.minutes)) return { minutes: p.minutes, lockOnLeave: !!p.lockOnLeave };
  } catch {
    /* fall through */
  }
  return DEFAULT_LOCK_PREFS;
}
export const writeLockPrefs = (p: LockPrefs) => set('local', PREFS_KEY, JSON.stringify(p));

export const lastActiveAt = () => Number(get('local', ACTIVITY_KEY) || 0);
export const touchActivity = () => set('local', ACTIVITY_KEY, String(Date.now()));

export const lastVerifiedAt = () => Number(get('session', VERIFIED_KEY) || 0);
/** Called after any successful sign-in, 2FA code or unlock. */
export function markVerified() {
  set('session', VERIFIED_KEY, String(Date.now()));
  touchActivity();
  set('session', LOCKED_KEY, null);
}

export const isMarkedLocked = () => get('session', LOCKED_KEY) === '1';
export const markLocked = () => set('session', LOCKED_KEY, '1');

/** Wipe lock state on sign-out. */
export function clearLockState() {
  set('session', VERIFIED_KEY, null);
  set('session', LOCKED_KEY, null);
  set('local', ACTIVITY_KEY, null);
}
