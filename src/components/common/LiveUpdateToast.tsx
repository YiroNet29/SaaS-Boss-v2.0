import React, { useEffect, useState } from 'react';
import { Radio, X } from 'lucide-react';
import { LIVE_UPDATE_EVENT } from '../../lib/db';

/** A short notice when something arrives from outside this tab (e.g. a receipt sent to the bot). */
export const LiveUpdateToast: React.FC = () => {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onUpdate = (e: Event) => {
      setMessage((e as CustomEvent<{ message: string }>).detail?.message ?? null);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 6000);
    };
    window.addEventListener(LIVE_UPDATE_EVENT, onUpdate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(LIVE_UPDATE_EVENT, onUpdate);
    };
  }, []);

  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md flex items-center gap-3 p-3 rounded-xl bg-slate-900/95 border border-indigo-500/40 text-slate-100 text-xs shadow-2xl"
    >
      <Radio className="w-4 h-4 shrink-0 text-indigo-400" />
      <p className="flex-1 min-w-0">{message}</p>
      <button onClick={() => setMessage(null)} aria-label="Dismiss" className="text-slate-400 hover:text-white">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
