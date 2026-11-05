import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase/client';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

interface AuthContextType {
  user: UserProfile | null;
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
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabase();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ? toProfile(data.user) : null);
      setIsLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? toProfile(session.user) : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

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
