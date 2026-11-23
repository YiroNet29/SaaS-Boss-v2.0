import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { formatDate } from '../../utils/formatters';

/** Shown when the ETB per USD rate is more than 30 days old, with a button to Settings to update it. */
export const RateStaleBanner: React.FC<{ onOpenSettings: () => void }> = ({ onOpenSettings }) => {
  const { currentWorkspace, isRateStale } = useWorkspace();
  if (!isRateStale) return null;
  return (
    <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-200">
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          Your ETB per USD exchange rate ({currentWorkspace.exchangeRates.ETB_per_USD} ETB/USD) hasn&apos;t been updated in over 30
          days (last updated {formatDate(currentWorkspace.exchangeRates.updatedAt)}).
        </span>
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold shrink-0 transition-colors"
      >
        Update Rate
      </button>
    </div>
  );
};
