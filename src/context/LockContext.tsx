import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Lock, Fingerprint, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from './AuthContext';
import { getSupabase } from '../lib/supabase/client';
import { reportSecurityEvent } from '../lib/api-client';
import { listPasskeys, supportsPasskeys, unlockWithPasskey, type PasskeyInfo } from '../lib/passkeys-client';
import {
  isMarkedLocked,
  lastActiveAt,
  lastVerifiedAt,
  markLocked,
  markVerified,
  readLockPrefs,
  touchActivity,
  writeLockPrefs,
  type LockPrefs,
} from '../lib/lock-state';

/** Re-confirming isn't needed again within this window. */
const RECENT_MS = 5 * 60_000;

interface LockContextType {
  enabled: boolean;
  locked: boolean;
  lockNow: () => void;
  prefs: LockPrefs;
  setPrefs: (p: LockPrefs) => void;
  /** Ask "is it really you?" before a risky action. Resolves true when confirmed. */
  confirmSensitive: (reason: string) => Promise<boolean>;
  passkeys: PasskeyInfo[];
  refreshPasskeys: () => Promise<void>;
  hasTwoFactor: boolean;
  refreshTwoFactor: () => Promise<void>;
}

const LockContext = createContext<LockContextType>({
  enabled: false,
  locked: false,
  lockNow: () => undefined,
  prefs: { minutes: 15, lockOnLeave: false },
  setPrefs: () => undefined,
  confirmSensitive: async () => true, // demo mode: nothing to protect
  passkeys: [],
  refreshPasskeys: async () => undefined,
  hasTwoFactor: false,
  refreshTwoFactor: async () => undefined,
});

export const useLock = () => useContext(LockContext);

/** App lock for the live workspace: idle / leave-the-app lock, and step-up confirmation. */
export const LockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [prefs, setPrefsState] = useState<LockPrefs>(() => readLockPrefs());
  const [locked, setLocked] = useState<boolean>(() => {
    const idle = lastActiveAt() > 0 && Date.now() - lastActiveAt() > readLockPrefs().minutes * 60_000;
    return isMarkedLocked() || idle;
  });
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [hasTwoFactor, setHasTwoFactor] = useState(false);
  const [confirmReason, setConfirmReason] = useState<string | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const hiddenAt = useRef<number | null>(null);

  const lockNow = useCallback(() => {
    markLocked();
    setLocked(true);
  }, []);

  const setPrefs = useCallback((p: LockPrefs) => {
    writeLockPrefs(p);
    setPrefsState(p);
  }, []);

  const refreshPasskeys = useCallback(async () => {
    try {
      setPasskeys(await listPasskeys());
    } catch {
      setPasskeys([]);
    }
  }, []);

  const refreshTwoFactor = useCallback(async () => {
    const { data } = await getSupabase().auth.mfa.listFactors();
    setHasTwoFactor(!!data?.totp?.length);
  }, []);

  useEffect(() => {
    if (locked) markLocked();
    else touchActivity();
    refreshPasskeys();
    refreshTwoFactor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Activity tracking + idle check + "lock when I leave".
  useEffect(() => {
    let lastWrite = 0;
    const onActivity = () => {
      if (locked) return;
      const now = Date.now();
      if (now - lastWrite > 15_000) {
        lastWrite = now;
        touchActivity();
      }
    };
    const check = () => {
      if (!locked && Date.now() - lastActiveAt() > prefs.minutes * 60_000) lockNow();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
      } else {
        if (prefs.lockOnLeave && hiddenAt.current && Date.now() - hiddenAt.current > 5_000) lockNow();
        hiddenAt.current = null;
        check();
      }
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    const timer = setInterval(check, 10_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(timer);
    };
  }, [locked, prefs, lockNow]);

  const onUnlocked = useCallback(() => {
    markVerified();
    setLocked(false);
  }, []);

  const confirmSensitive = useCallback((reason: string) => {
    if (Date.now() - lastVerifiedAt() < RECENT_MS) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setConfirmReason(reason);
    });
  }, []);

  const finishConfirm = (ok: boolean) => {
    if (ok) markVerified();
    resolver.current?.(ok);
    resolver.current = null;
    setConfirmReason(null);
  };

  const value: LockContextType = {
    enabled: true,
    locked,
    lockNow,
    prefs,
    setPrefs,
    confirmSensitive,
    passkeys,
    refreshPasskeys,
    hasTwoFactor,
    refreshTwoFactor,
  };

  return (
    <LockContext.Provider value={value}>
      {locked ? (
        <div className="min-h-full flex items-center justify-center p-4 bg-slate-950 text-slate-100">
          <UnlockPanel mode="lock" passkeys={passkeys} hasTwoFactor={hasTwoFactor} onUnlocked={onUnlocked} />
        </div>
      ) : (
        children
      )}
      {confirmReason !== null && !locked && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm it's you"
        >
          <UnlockPanel
            mode="confirm"
            reason={confirmReason}
            passkeys={passkeys}
            hasTwoFactor={hasTwoFactor}
            onUnlocked={() => finishConfirm(true)}
            onCancel={() => finishConfirm(false)}
          />
        </div>
      )}
    </LockContext.Provider>
  );
};

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500';

/** Unlock with a passkey, the 2FA code (if on) or the password (if 2FA is off). Every check happens on a server. */
const UnlockPanel: React.FC<{
  mode: 'lock' | 'confirm';
  reason?: string;
  passkeys: PasskeyInfo[];
  hasTwoFactor: boolean;
  onUnlocked: () => void;
  onCancel?: () => void;
}> = ({ mode, reason, passkeys, hasTwoFactor, onUnlocked, onCancel }) => {
  const { user, signOut, verifyMfaCode } = useAuth();
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState<'passkey' | 'secret' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canPasskey = passkeys.length > 0 && supportsPasskeys();

  const failed = async (message: string, details: string) => {
    const res = await reportSecurityEvent('unlock_failed', details);
    if (res.signOut) {
      await signOut();
      return;
    }
    setError(res.attemptsLeft !== undefined && res.attemptsLeft <= 3 ? `${message} ${res.attemptsLeft} attempts left.` : message);
  };

  const viaPasskey = async () => {
    setBusy('passkey');
    setError(null);
    const res = await unlockWithPasskey();
    setBusy(null);
    if (res.ok) return onUnlocked();
    if (res.signOut) return signOut();
    setError(res.error === 'Cancelled.' ? 'Cancelled. Try again, or use the other option below.' : res.error || 'Could not verify.');
  };

  const viaSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('secret');
    setError(null);
    try {
      if (hasTwoFactor) {
        await verifyMfaCode(secret);
      } else {
        const { error: err } = await getSupabase().auth.signInWithPassword({ email: user?.email ?? '', password: secret });
        if (err) throw new Error('Wrong password.');
      }
      await reportSecurityEvent('unlock', hasTwoFactor ? 'Unlocked with 2FA code' : 'Unlocked with password');
      setSecret('');
      onUnlocked();
    } catch (err) {
      setSecret('');
      await failed(
        err instanceof Error ? err.message : 'Could not verify.',
        hasTwoFactor ? 'Wrong 2FA code on lock screen' : 'Wrong password on lock screen'
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-2xl text-slate-100">
      <div className="text-center space-y-2">
        <div className="w-11 h-11 mx-auto rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300">
          {mode === 'lock' ? <Lock className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
        </div>
        <h1 className="text-base font-bold">{mode === 'lock' ? 'StackTrack is locked' : "Confirm it's you"}</h1>
        <p className="text-xs text-slate-400">
          {mode === 'lock' ? `Signed in as ${user?.email ?? ''}` : `Needed to: ${reason}`}
        </p>
      </div>

      {canPasskey && (
        <button
          type="button"
          onClick={viaPasskey}
          disabled={busy !== null}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-sm font-semibold"
        >
          {busy === 'passkey' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
          Unlock with fingerprint / Face ID
        </button>
      )}

      <form onSubmit={viaSecret} className="space-y-2">
        {canPasskey && <p className="text-[11px] text-center text-slate-500">or</p>}
        <input
          className={hasTwoFactor ? `${inputCls} text-center tracking-[0.4em] font-mono` : inputCls}
          type={hasTwoFactor ? 'text' : 'password'}
          inputMode={hasTwoFactor ? 'numeric' : undefined}
          autoComplete={hasTwoFactor ? 'one-time-code' : 'current-password'}
          maxLength={hasTwoFactor ? 6 : undefined}
          aria-label={hasTwoFactor ? '6-digit code from your authenticator app' : 'Your password'}
          placeholder={hasTwoFactor ? '2FA code' : 'Your password'}
          value={secret}
          onChange={(e) => setSecret(hasTwoFactor ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value)}
          autoFocus={!canPasskey}
          required
        />
        <button
          type="submit"
          disabled={busy !== null || !secret}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 ${
            canPasskey ? 'bg-slate-800 hover:bg-slate-750 border border-slate-700' : 'bg-indigo-600 hover:bg-indigo-500'
          }`}
        >
          {busy === 'secret' && <Loader2 className="w-4 h-4 animate-spin" />}
          {hasTwoFactor ? 'Unlock with code' : 'Unlock with password'}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-xs text-rose-400 text-center">
          {error}
        </p>
      )}

      <div className="flex justify-between text-xs text-slate-400">
        {mode === 'confirm' ? (
          <button type="button" onClick={onCancel} className="hover:text-slate-200">
            Cancel
          </button>
        ) : (
          <span />
        )}
        <button type="button" onClick={() => signOut()} className="hover:text-rose-300">
          Sign out
        </button>
      </div>
    </div>
  );
};
