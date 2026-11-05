import React, { useRef, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { AppLayout } from './components/layout/AppLayout';
import { AuthScreen } from './components/auth/AuthScreen';
import { SyncErrorToast } from './components/common/SyncErrorToast';
import { LockProvider } from './context/LockContext';

const FullScreen: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-full flex flex-col items-center justify-center gap-3 p-6 bg-slate-950 text-slate-300 text-sm text-center">
    {children}
  </div>
);

/** Demo mode needs no account. Live mode needs a signed-in Supabase user and loads their data first. */
function AuthGate() {
  const { user, isLoading, mfaPendingEmail } = useAuth();
  const { isDemoMode, liveStatus, liveError, reloadLiveData } = useWorkspace();
  // Only block the screen for the first load; switching workspaces later reloads in the background.
  const hasLoadedOnce = useRef(false);
  if (liveStatus === 'ready') hasLoadedOnce.current = true;
  const [isResettingPassword, setIsResettingPassword] = useState(
    () => new URLSearchParams(window.location.search).get('reset') === '1'
  );

  if (isDemoMode) return <AppLayout />;

  if (isLoading) {
    return (
      <FullScreen>
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      </FullScreen>
    );
  }

  if (!user) {
    hasLoadedOnce.current = false;
    return mfaPendingEmail !== null ? <AuthScreen key="mfa" initialMode="mfa" /> : <AuthScreen key="signin" />;
  }

  if (isResettingPassword) {
    return (
      <AuthScreen
        initialMode="new-password"
        onDone={() => {
          window.history.replaceState(null, '', '/');
          setIsResettingPassword(false);
        }}
      />
    );
  }

  if (liveStatus === 'error') {
    return (
      <FullScreen>
        <AlertTriangle className="w-6 h-6 text-rose-400" />
        <p className="font-semibold text-slate-100">Couldn't load your workspace</p>
        <p className="text-xs text-slate-400 max-w-md break-words">{liveError}</p>
        <button
          onClick={reloadLiveData}
          className="mt-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
        >
          Try again
        </button>
      </FullScreen>
    );
  }

  if (liveStatus !== 'ready' && !hasLoadedOnce.current) {
    return (
      <FullScreen>
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
        <p className="text-xs text-slate-400">Loading your workspace…</p>
      </FullScreen>
    );
  }

  return (
    <LockProvider>
      <AppLayout />
      <SyncErrorToast />
    </LockProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <AuthGate />
        </WorkspaceProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
