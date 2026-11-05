import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Smartphone, Loader2, Trash2, Plus, KeyRound } from 'lucide-react';
import { getSupabase } from '../../lib/supabase/client';
import { useWorkspace } from '../../context/WorkspaceContext';

interface TotpFactor {
  id: string;
  friendly_name?: string;
  created_at: string;
}

interface Enrollment {
  factorId: string;
  qr: string;
  secret: string;
}

interface Props {
  /** Asks you to unlock again before a risky change (3.5); resolves true when confirmed. */
  confirmSensitive: (reason: string) => Promise<boolean>;
  /** Records a security event (3.6). */
  onSecurityEvent?: (type: 'mfa_enabled' | 'mfa_disabled' | 'mfa_device_added' | 'mfa_device_removed', detail: string) => void;
  children?: React.ReactNode;
}

const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-60';

/** Settings → Security: two-factor login (authenticator app). App lock and passkeys plug in as children. */
export const SecuritySettingsCard: React.FC<Props> = ({ confirmSensitive, onSecurityEvent, children }) => {
  const { isDemoMode } = useWorkspace();
  const [factors, setFactors] = useState<TotpFactor[] | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await getSupabase().auth.mfa.listFactors();
    if (err) {
      setError(err.message);
      return;
    }
    setFactors(data.totp as TotpFactor[]);
  }, []);

  useEffect(() => {
    if (!isDemoMode) load();
  }, [isDemoMode, load]);

  const startEnroll = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const supabase = getSupabase();
      // Clear half-finished setups first; they'd otherwise block reusing the name.
      const { data: all } = await supabase.auth.mfa.listFactors();
      for (const f of all?.all ?? []) {
        if (f.factor_type === 'totp' && f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const n = (factors?.length ?? 0) + 1;
      const { data, error: err } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: n === 1 ? 'Authenticator' : `Authenticator ${n} (${new Date().toISOString().slice(0, 10)})`,
        issuer: 'StackTrack',
      });
      if (err) throw err;
      setEnrollment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollment) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await getSupabase().auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code });
      if (err) throw new Error(/invalid/i.test(err.message) ? 'That code is not right. Use the current one from the app.' : err.message);
      const first = !factors?.length;
      setEnrollment(null);
      setNotice(first ? 'Two-factor login is on. You will be asked for a code when you sign in.' : 'Device added.');
      onSecurityEvent?.(first ? 'mfa_enabled' : 'mfa_device_added', first ? 'Two-factor login turned on' : 'Authenticator device added');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const cancelEnroll = async () => {
    if (enrollment) await getSupabase().auth.mfa.unenroll({ factorId: enrollment.factorId }).catch(() => undefined);
    setEnrollment(null);
    setError(null);
  };

  const remove = async (f: TotpFactor) => {
    const last = factors?.length === 1;
    const ok = await confirmSensitive(
      last ? 'turn off two-factor login' : `remove the authenticator "${f.friendly_name || 'Authenticator'}"`
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error: err } = await getSupabase().auth.mfa.unenroll({ factorId: f.id });
      if (err) throw err;
      onSecurityEvent?.(last ? 'mfa_disabled' : 'mfa_device_removed', last ? 'Two-factor login turned off' : 'Authenticator device removed');
      setNotice(last ? 'Two-factor login is off.' : 'Device removed.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (isDemoMode) {
    return (
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" /> Security
        </h3>
        <p className="text-xs text-slate-400">Two-factor login and the app lock are available in your live workspace.</p>
      </div>
    );
  }

  const on = !!factors?.length;

  return (
    <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
      <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-400" /> Security
      </h3>

      {/* Two-factor login */}
      <section className="space-y-3" aria-labelledby="twofa-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 id="twofa-title" className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-indigo-400" /> Two-factor login
              <span
                className={`ml-1 text-[10px] px-1.5 py-0.5 rounded border ${
                  on ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {factors === null ? '…' : on ? 'On' : 'Off'}
              </span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              After your password, sign-in asks for a 6-digit code from an authenticator app (Google Authenticator,
              Authy, 1Password…). Your data can't be opened with the password alone.
            </p>
          </div>
          {!on && !enrollment && factors !== null && (
            <button type="button" onClick={startEnroll} disabled={busy} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white shrink-0`}>
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Turn on
            </button>
          )}
        </div>

        {enrollment && (
          <form onSubmit={confirmEnroll} className="p-3 rounded-xl bg-slate-800/50 border border-slate-700 space-y-3">
            <p className="text-[11px] text-slate-300">
              1. Scan this with your authenticator app. 2. Enter the 6-digit code it shows.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <img src={enrollment.qr} alt="QR code for your authenticator app" className="w-40 h-40 rounded-lg bg-white p-2" />
              <div className="space-y-2 min-w-0 flex-1">
                <p className="text-[11px] text-slate-400">Can't scan? Enter this key in the app:</p>
                <code className="block text-[11px] text-indigo-300 break-all select-all">{enrollment.secret}</code>
                <input
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-center text-base tracking-[0.4em] font-mono text-slate-100"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  aria-label="6-digit code from your authenticator app"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
                <div className="flex gap-2">
                  <button type="submit" disabled={busy || code.length !== 6} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Confirm
                  </button>
                  <button type="button" onClick={cancelEnroll} className={`${btn} bg-slate-800 border border-slate-700 text-slate-300`}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {on && (
          <ul className="space-y-2">
            {factors!.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-800/40 border border-slate-750">
                <span className="flex items-center gap-2 text-xs text-slate-200 min-w-0">
                  <Smartphone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{f.friendly_name || 'Authenticator'}</span>
                  <span className="text-[10px] text-slate-500 shrink-0">added {f.created_at.slice(0, 10)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => remove(f)}
                  disabled={busy}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300"
                  aria-label={factors!.length === 1 ? 'Turn off two-factor login' : `Remove ${f.friendly_name || 'device'}`}
                  title={factors!.length === 1 ? 'Turn off two-factor login' : 'Remove this device'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
            {!enrollment && (
              <li>
                <button type="button" onClick={startEnroll} disabled={busy} className={`${btn} bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300`}>
                  <Plus className="w-3 h-3" /> Add a backup device
                </button>
                <p className="text-[11px] text-slate-500 mt-1">
                  A second phone or password manager means a lost phone doesn't lock you out.
                </p>
              </li>
            )}
          </ul>
        )}
        {error && <p className="text-xs text-rose-400">{error}</p>}
        {notice && <p className="text-xs text-emerald-400">{notice}</p>}
      </section>

      {children}
    </div>
  );
};
