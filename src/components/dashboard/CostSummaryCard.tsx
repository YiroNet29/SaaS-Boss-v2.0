import React from 'react';
import {
  DollarSign,
  TrendingUp,
  Layers,
  Link2,
  Clock,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface CostSummaryCardProps {
  onOpenSettings: () => void;
  onFilterOverdue: () => void;
  onFilterTrials: () => void;
}

export const CostSummaryCard: React.FC<CostSummaryCardProps> = ({
  onOpenSettings,
  onFilterOverdue,
  onFilterTrials,
}) => {
  const {
    currentWorkspace,
    totalCosts,
    products,
    activeServicesCount,
    trialsEndingCount,
    overdueCount,
    isRateStale,
  } = useWorkspace();

  return (
    <div className="space-y-4">
      {/* Stale Exchange Rate Alert Banner */}
      {isRateStale && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Your ETB per USD exchange rate ({currentWorkspace.exchangeRates.ETB_per_USD} ETB/USD) hasn't been updated in over 30 days (last updated {formatDate(currentWorkspace.exchangeRates.updatedAt)}).
            </span>
          </div>
          <button
            onClick={onOpenSettings}
            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold shrink-0 transition-colors"
          >
            Update Rate
          </button>
        </div>
      )}

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Monthly Burn (USD & ETB side by side) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-stone-200/90 dark:border-slate-800 shadow-xs sm:col-span-2 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-stone-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Total Monthly Stack Cost
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 dark:bg-slate-800 text-stone-600 dark:text-slate-300 border border-stone-200 dark:border-slate-700 shadow-2xs">
              Yearly plans amortized / 12
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-4 sm:gap-6">
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-slate-100 font-mono tracking-tight">
                {formatCurrency(totalCosts.totalUsd, 'USD')}
              </div>
              <div className="text-xs text-stone-500 dark:text-slate-400 font-medium mt-0.5">United States Dollar</div>
            </div>

            <div className="h-10 w-px bg-stone-200 dark:bg-slate-800 hidden sm:block" />

            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
                {formatCurrency(totalCosts.totalEtb, 'ETB')}
              </div>
              <div className="text-xs text-stone-500 dark:text-slate-400 font-medium mt-0.5 flex items-center gap-1">
                <span>Ethiopian Birr</span>
                <span className="text-[10px] text-stone-400 dark:text-slate-500">(@ {currentWorkspace.exchangeRates.ETB_per_USD})</span>
              </div>
            </div>
          </div>
        </div>

        {/* Products Count */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Products</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-100 font-mono">{products.length}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {currentWorkspace.plan === 'free' ? `${products.length}/5 free limit` : 'Unlimited Pro'}
            </div>
          </div>
        </div>

        {/* Active Services Count */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Active Services</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Link2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-100 font-mono">{activeServicesCount}</div>
            <div className="text-xs text-slate-400 mt-0.5">Across all environments</div>
          </div>
        </div>

        {/* Trials Ending Card */}
        <button
          onClick={onFilterTrials}
          className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-left transition-colors flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-medium text-slate-400">Trials Ending Soon</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-amber-300 font-mono">{trialsEndingCount}</div>
            <div className="text-xs text-slate-400 mt-0.5">Next 14 days</div>
          </div>
        </button>

        {/* Overdue Items Alert Card */}
        <button
          onClick={onFilterOverdue}
          className={`p-4 rounded-2xl border text-left transition-colors flex flex-col justify-between group ${
            overdueCount > 0
              ? 'bg-rose-500/10 border-rose-500/30 hover:border-rose-500/50'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className={`text-xs font-medium ${overdueCount > 0 ? 'text-rose-300' : 'text-slate-400'}`}>
              Overdue Milestones
            </span>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform ${
                overdueCount > 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-400'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-2xl font-bold font-mono ${overdueCount > 0 ? 'text-rose-400' : 'text-slate-100'}`}>
              {overdueCount}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {overdueCount > 0 ? 'Immediate action required' : 'All up to date'}
            </div>
          </div>
        </button>
      </div>
    </div>
  );
};
