import React, { useState } from 'react';
import { Lock, Fingerprint, Trash2, Plus, Loader2 } from 'lucide-react';
import { useLock } from '../../context/LockContext';
import { LOCK_MINUTE_OPTIONS } from '../../lib/lock-state';
import { addPasskey, removePasskey, supportsPasskeys } from '../../lib/passkeys-client';
import { describeDevice } from '../../lib/api-client';

const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-60';

/** Settings → Security → App lock and passkeys. */
export const AppLockSettings: React.FC = () => {
  const { prefs, setPrefs, lockNow, passkeys, refreshPasskeys, confirmSensitive } = useLock();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canPasskey = supportsPasskeys();

  const add = async () => {
    setBusy('add');
    setError(null);
    setNotice(null);
    try {
      await addPasskey(describeDevice());
      await refreshPasskeys();
      setNotice('Added. You can now unlock with your fingerprint / Face ID on this device.');
    } catch (err) {
      const name = (err as { name?: string }).name;
      setError(name === 'NotAllowedError' ? 'Cancelled.' : name === 'InvalidStateError' ? 'This device already has a passkey.' : err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!(await confirmSensitive(`remove the passkey "${name}"`))) return;
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await removePasskey(id);
      await refreshPasskeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3 pt-4 border-t border-slate-800" aria-labelledby="applock-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 id="applock-title" className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-indigo-400" /> App lock
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Locks the app on this device when you're away. Unlocking is checked by the server.
          </p>
        </div>
        <button type="button" onClick={lockNow} className={`${btn} bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 shrink-0`}>
          Lock now
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-300">
        <label className="flex items-center gap-2">
          Lock after
          <select
            value={prefs.minutes}
            onChange={(e) => setPrefs({ ...prefs, minutes: Number(e.target.value) })}
            className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-100"
          >
            {LOCK_MINUTE_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} minutes of no use
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={prefs.lockOnLeave}
            onChange={(e) => setPrefs({ ...prefs, lockOnLeave: e.target.checked })}
            className="w-4 h-4 rounded"
          />
          Also lock when I leave the app
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
          <Fingerprint className="w-3.5 h-3.5 text-emerald-400" /> Fingerprint / Face ID (passkeys)
        </p>
        {passkeys.length > 0 && (
          <ul className="space-y-2">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-800/40 border border-slate-750">
                <span className="text-xs text-slate-200 min-w-0 truncate">
                  {p.name}
                  <span className="ml-2 text-[10px] text-slate-500">
                    added {p.createdAt.slice(0, 10)}
                    {p.lastUsedAt ? ` · last used ${p.lastUsedAt.slice(0, 10)}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => remove(p.id, p.name)}
                  disabled={busy !== null}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300"
                  aria-label={`Remove passkey ${p.name}`}
                >
                  {busy === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </li>
            ))}
          </ul>
        )}
        {canPasskey ? (
          <button type="button" onClick={add} disabled={busy !== null} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>
            {busy === 'add' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Add fingerprint / Face ID on this device
          </button>
        ) : (
          <p className="text-[11px] text-slate-500">This browser doesn't support passkeys. Unlock uses your code or password.</p>
        )}
        {error && <p className="text-xs text-rose-400">{error}</p>}
        {notice && <p className="text-xs text-emerald-400">{notice}</p>}
      </div>
    </section>
  );
};
