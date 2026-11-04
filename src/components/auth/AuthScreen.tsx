import React, { useState } from 'react';
import { Layers, Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { getSupabase } from '../../lib/supabase/client';

type Mode = 'signin' | 'signup' | 'reset' | 'new-password';

const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500';

/** Sign-in screen shown in live mode when nobody is signed in (or after a password-reset link). */
export const AuthScreen: React.FC<{ initialMode?: Mode; onDone?: () => void }> = ({ initialMode = 'signin', onDone }) => {
  const { signIn, signUp, signInWithGoogle, resetPassword, isConfigured } = useAuth();
  const { setDemoMode } = useWorkspace();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else if (mode === 'signup') {
        const needsConfirm = await signUp(email.trim(), password, name.trim() || undefined);
        if (needsConfirm) setNotice('Check your inbox and click the confirmation link to finish signing up.');
      } else if (mode === 'reset') {
        await resetPassword(email.trim());
        setNotice('If an account exists for that email, a reset link is on its way.');
      } else {
        const { error: err } = await getSupabase().auth.updateUser({ password });
        if (err) throw err;
        setNotice('Password updated.');
        onDone?.();
      }
    });
  };

  const title = {
    signin: 'Sign in to your workspace',
    signup: 'Create your account',
    reset: 'Reset your password',
    'new-password': 'Choose a new password',
  }[mode];

  return (
    <div className="min-h-full flex items-center justify-center p-4 bg-slate-950 text-slate-100">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex items-center gap-2.5 justify-center">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-extrabold tracking-tight">StackTrack</span>
        </div>

        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-2xl">
          <h1 className="text-base font-bold text-center">{title}</h1>

          {!isConfigured ? (
            <div className="flex gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                Supabase isn't configured yet. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
                <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then reload. Demo mode works without it.
              </p>
            </div>
          ) : (
            <>
              <form onSubmit={onSubmit} className="space-y-3">
                {mode === 'signup' && (
                  <input className={inputCls} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
                )}
                {mode !== 'new-password' && (
                  <input
                    className={inputCls}
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
                {mode !== 'reset' && (
                  <input
                    className={inputCls}
                    type="password"
                    required
                    minLength={8}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    placeholder={mode === 'signin' ? 'Password' : 'Password (8+ characters)'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}

                {error && <p className="text-xs text-rose-400">{error}</p>}
                {notice && <p className="text-xs text-emerald-400">{notice}</p>}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-sm font-semibold transition-colors"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {mode === 'signin' && 'Sign in'}
                  {mode === 'signup' && 'Create account'}
                  {mode === 'reset' && 'Send reset link'}
                  {mode === 'new-password' && 'Save password'}
                </button>
              </form>

              {(mode === 'signin' || mode === 'signup') && (
                <>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <div className="h-px flex-1 bg-slate-800" />
                    or
                    <div className="h-px flex-1 bg-slate-800" />
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(signInWithGoogle)}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-sm font-semibold transition-colors"
                  >
                    Continue with Google
                  </button>
                </>
              )}

              <div className="flex justify-between text-xs text-slate-400">
                {mode === 'signin' ? (
                  <>
                    <button type="button" className="hover:text-slate-200" onClick={() => setMode('signup')}>
                      Create account
                    </button>
                    <button type="button" className="hover:text-slate-200" onClick={() => setMode('reset')}>
                      Forgot password?
                    </button>
                  </>
                ) : mode !== 'new-password' ? (
                  <button type="button" className="hover:text-slate-200" onClick={() => setMode('signin')}>
                    ← Back to sign in
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>

        {mode !== 'new-password' && (
          <button
            type="button"
            onClick={() => setDemoMode(true)}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-amber-300 hover:text-amber-200"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Explore the demo without an account
          </button>
        )}
      </div>
    </div>
  );
};
