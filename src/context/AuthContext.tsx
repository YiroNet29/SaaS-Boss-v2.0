import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase/client';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

interface AuthContextType {
  /** Set only once sign-in is complete (password, plus the 2FA code when 2FA is on). */
  user: UserProfile | null;
  /** Password accepted, waiting for the 6-digit authenticator code. */
  mfaPendingEmail: string | null;
  verifyMfaCode: (code: string) => Promise<void>;
  isAuthenticated: boolean;
  /** True until the stored session has been checked on page load. */
  isLoading: boolean;
  isConfigured: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  /** Returns true when the account still needs email confirmation. */
  signUp: (email: string, pass: string, name?: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function toProfile(u: User): UserProfile {
  const meta = (u.user_metadata ?? {}) as Record<string, string | undefined>;
  return {
    uid: u.id,
    email: u.email ?? '',
    displayName: meta.full_name || meta.name || u.email?.split('@')[0] || 'Founder',
    avatarUrl: meta.avatar_url || meta.picture,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [mfaPendingEmail, setMfaPendingEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);

  // Signed in only when the session meets the account's assurance level: with 2FA on, a
  // password-only session waits for the code and no data is loaded.
  const evaluate = useCallback(async (u: User | null) => {
    if (!u) {
      setUser(null);
      setMfaPendingEmail(null);
      return;
    }
    const { data } = await getSupabase().auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2') {
      setUser(null);
      setMfaPendingEmail(u.email ?? '');
    } else {
      setMfaPendingEmail(null);
      setUser(toProfile(u));
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabase();

    supabase.auth.getUser().then(async ({ data }) => {
      await evaluate(data.user);
      setIsLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer: calling Supabase from inside this callback can deadlock its auth lock.
      setTimeout(() => evaluate(session?.user ?? null), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [evaluate]);

  const verifyMfaCode = async (code: string) => {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    if (!data.totp.length) throw new Error('No authenticator is set up for this account.');
    // A code from any of your authenticator devices works.
    let lastError: Error | null = null;
    for (const factor of data.totp) {
      const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
      if (!verifyErr) {
        lastError = null;
        break;
      }
      lastError = verifyErr;
    }
    if (lastError) {
      throw new Error(/invalid/i.test(lastError.message) ? 'That code is not right. Try the current one.' : lastError.message);
    }
    const { data: u } = await supabase.auth.getUser();
    await evaluate(u.user);
  };

  const signIn = async (email: string, pass: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
  };

  const signUp = async (email: string, pass: string, name?: string) => {
    const { data, error } = await getSupabase().auth.signUp({
      email,
      password: pass,
      options: {
        data: name ? { full_name: name } : undefined,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
    return !data.session;
  };

  const signInWithGoogle = async () => {
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
  };

  const resetPassword = async (email: string) => {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/?reset=1')}`,
    });
    if (error) throw error;
  };

  const signOut = async () => {
    try {
      if (isSupabaseConfigured) await getSupabase().auth.signOut();
    } finally {
      setUser(null);
      // Reload so no live data stays in this page's memory.
      if (typeof window !== 'undefined') window.location.replace('/');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        mfaPendingEmail,
        verifyMfaCode,
        isAuthenticated: !!user,
        isLoading,
        isConfigured: isSupabaseConfigured,
        signIn,
        signUp,
        signInWithGoogle,
        resetPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
