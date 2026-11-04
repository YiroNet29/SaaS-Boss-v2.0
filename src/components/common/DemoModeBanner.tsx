import React from 'react';
import { Sparkles, ArrowRight, DownloadCloud, EyeOff, ShieldCheck } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

export const DemoModeBanner: React.FC = () => {
  const { isDemoMode, setDemoMode, importDemoStacksIntoLive } = useWorkspace();

  if (!isDemoMode) return null;

  return (
    <aside aria-label="Demo mode indicator" className="bg-amber-500/10 dark:bg-amber-950/20 border-b border-amber-500/20 dark:border-amber-900/30 px-4 py-2 shrink-0">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
          <div className="w-5 h-5 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <span className="font-bold text-amber-800 dark:text-amber-200">DEMO MODE ACTIVE</span>
            <span className="text-stone-600 dark:text-slate-400 ml-1.5 hidden md:inline">
              Exploring 3 sample SaaS stacks with pre-seeded services, renewals, and Vault links.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={importDemoStacksIntoLive}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/25 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold transition-colors"
            title="Copy these 3 sample stacks into your live Supabase workspace"
          >
            <DownloadCloud className="w-3.5 h-3.5" />
            <span>Import to Live</span>
          </button>

          <button
            onClick={() => setDemoMode(false)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 dark:bg-amber-900/40 dark:hover:bg-amber-800/50 text-amber-900 dark:text-amber-200 border border-amber-500/30 dark:border-amber-700/40 font-semibold text-[11px] transition-colors"
          >
            <span>Exit Demo Mode</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </aside>
  );
};
