import React, { useEffect, useState } from 'react';
import { CloudOff, X } from 'lucide-react';
import { SYNC_ERROR_EVENT } from '../../lib/db';

/** Shows a toast when a write to Supabase fails, so changes are never lost silently. */
export const SyncErrorToast: React.FC = () => {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onError = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string }>).detail;
      setMessage(detail?.message ?? 'Unknown error');
    };
    window.addEventListener(SYNC_ERROR_EVENT, onError);
    return () => window.removeEventListener(SYNC_ERROR_EVENT, onError);
  }, []);

  if (!message) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md flex items-start gap-3 p-3 rounded-xl bg-rose-950/95 border border-rose-800 text-rose-100 text-xs shadow-2xl"
    >
      <CloudOff className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold">A change couldn't be saved to the server</p>
        <p className="text-rose-300/80 break-words mt-0.5">{message}</p>
        <p className="text-rose-300/80 mt-1">Reload the page to see what's saved.</p>
      </div>
      <button onClick={() => setMessage(null)} aria-label="Dismiss" className="text-rose-300 hover:text-white">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
