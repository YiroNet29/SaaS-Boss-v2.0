import React, { useEffect, useState } from 'react';
import { CheckCircle2, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useWorkspace } from '../../context/WorkspaceContext';
import { OFFLINE_WRITES_EVENT, waitingWrites } from '../../lib/db';

/**
 * Connection status. In a live workspace, changes made while offline wait in this tab and are saved
 * (in order) as soon as the server can be reached again; this says how many are waiting.
 */
export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { isDemoMode } = useWorkspace();
  const [waiting, setWaiting] = useState(waitingWrites);
  const [justSaved, setJustSaved] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = (e: Event) => {
      const { waiting: w, saved } = (e as CustomEvent<{ waiting: number; saved: number }>).detail;
      setWaiting(w);
      if (saved) {
        setJustSaved(saved);
        clearTimeout(timer);
        timer = setTimeout(() => setJustSaved(0), 5000);
      }
    };
    window.addEventListener(OFFLINE_WRITES_EVENT, onChange);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(OFFLINE_WRITES_EVENT, onChange);
    };
  }, []);

  const base =
    'fixed bottom-20 md:bottom-6 left-4 right-4 sm:right-auto z-50 flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium shadow-xl border';

  if (justSaved && !waiting) {
    return (
      <div role="status" className={`${base} bg-emerald-500/95 text-slate-950 border-emerald-400`}>
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>Back online: {justSaved} change{justSaved === 1 ? '' : 's'} saved.</span>
      </div>
    );
  }
  if (isOnline && !waiting) return null;

  const message = isDemoMode
    ? 'Offline. Demo data is on this device, so everything keeps working.'
    : waiting
      ? `${isOnline ? "Can't reach the server" : 'Offline'}: ${waiting} change${waiting === 1 ? ' is' : 's are'} waiting and will be saved when the connection is back. Keep this tab open.`
      : "Offline. You can keep working; changes are saved when you're back online. Keep this tab open.";

  return (
    <div role="status" className={`${base} bg-amber-500/95 text-slate-950 border-amber-400`}>
      <WifiOff className="w-4 h-4 shrink-0 animate-pulse" />
      <span>{message}</span>
    </div>
  );
};
