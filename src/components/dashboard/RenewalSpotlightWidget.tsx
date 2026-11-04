import React, { useState, useMemo } from 'react';
import {
  Clock,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Flame,
  Sparkles,
  Layers,
  ChevronRight,
  Filter,
  RefreshCw,
  Edit2,
  Calendar,
  CreditCard,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import {
  getExpiringServices,
  getRenewalUrgency,
  RenewalSpotlightItem,
} from '../../utils/renewalSpotlight';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { ServiceLink } from '../../types';

interface RenewalSpotlightWidgetProps {
  onEditService: (service: ServiceLink) => void;
  onSelectProduct: (productId: string) => void;
  onSelectTab: (tab: string) => void;
  onQuickAddService: () => void;
}

export const RenewalSpotlightWidget: React.FC<RenewalSpotlightWidgetProps> = ({
  onEditService,
  onSelectProduct,
  onSelectTab,
  onQuickAddService,
}) => {
  const { services, products, currentWorkspace } = useWorkspace();
  const [filterMode, setFilterMode] = useState<'all' | 'imminent' | 'trials' | 'high_impact'>('all');

  // Compute 30-day renewal spotlight data
  const summary = useMemo(() => {
    return getExpiringServices(services, products, {
      daysThreshold: 30,
      exchangeRateEtbPerUsd: currentWorkspace.exchangeRates.ETB_per_USD,
    });
  }, [services, products, currentWorkspace.exchangeRates.ETB_per_USD]);

  // Apply UI filter tabs
  const filteredItems = useMemo(() => {
    if (filterMode === 'imminent') {
      return summary.items.filter((item) => item.daysRemaining <= 7);
    }
    if (filterMode === 'trials') {
      return summary.items.filter((item) => item.dateType === 'trial');
    }
    if (filterMode === 'high_impact') {
      return summary.items.filter((item) => item.isHighImpact);
    }
    return summary.items;
  }, [summary.items, filterMode]);

  const exposureInEtb = Math.round(summary.totalExposureUsd * currentWorkspace.exchangeRates.ETB_per_USD);

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-stone-200/90 dark:border-slate-800 shadow-sm transition-all">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-stone-200/80 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500/20 to-rose-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 dark:text-amber-400 shrink-0">
            <Flame className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-extrabold text-stone-900 dark:text-slate-100 tracking-tight">
                Renewal Spotlight
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                Next 30 Days
              </span>
              {summary.imminentCount > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span>{summary.imminentCount} Critical</span>
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500 dark:text-slate-400 mt-0.5">
              Surfacing high-priority expiring SaaS subscriptions, cloud renewals, and trial deadlines
            </p>
          </div>
        </div>

        {/* 30-Day Exposure Pill */}
        <div className="flex items-center gap-2 bg-stone-100/80 dark:bg-slate-850 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-slate-800 text-right self-start sm:self-auto">
          <div>
            <div className="text-[10px] text-stone-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
              30d Exposure
            </div>
            <div className="text-xs sm:text-sm font-extrabold text-stone-900 dark:text-slate-100 font-mono">
              ${summary.totalExposureUsd}{' '}
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal">
                ({exposureInEtb.toLocaleString()} ETB)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 my-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
              filterMode === 'all'
                ? 'bg-stone-900 text-white dark:bg-slate-800 dark:text-slate-100 dark:border dark:border-slate-700 shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:text-slate-200 dark:border dark:border-slate-800'
            }`}
          >
            All Expiring ({summary.totalExpiringCount})
          </button>
          <button
            onClick={() => setFilterMode('imminent')}
            className={`px-2.5 py-1 rounded-lg font-medium flex items-center gap-1 transition-all ${
              filterMode === 'imminent'
                ? 'bg-rose-600 text-white dark:bg-rose-950/60 dark:text-rose-300 dark:border dark:border-rose-900/60 shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:text-slate-200 dark:border dark:border-slate-800'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            <span>&le; 7 Days ({summary.imminentCount})</span>
          </button>
          <button
            onClick={() => setFilterMode('trials')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
              filterMode === 'trials'
                ? 'bg-amber-600 text-white dark:bg-amber-950/60 dark:text-amber-300 dark:border dark:border-amber-900/60 shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:text-slate-200 dark:border dark:border-slate-800'
            }`}
          >
            Trials Ending ({summary.trialCount})
          </button>
          <button
            onClick={() => setFilterMode('high_impact')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
              filterMode === 'high_impact'
                ? 'bg-indigo-600 text-white dark:bg-indigo-950/60 dark:text-indigo-300 dark:border dark:border-indigo-900/60 shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:text-slate-200 dark:border dark:border-slate-800'
            }`}
          >
            High Impact (&gt;$35 or Annual)
          </button>
        </div>

        <button
          onClick={() => onSelectTab('services')}
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold flex items-center gap-1"
        >
          <span>View All Services</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Spotlight Cards Grid */}
      {filteredItems.length === 0 ? (
        <div className="py-8 px-4 text-center rounded-xl bg-stone-50 dark:bg-slate-900/60 border border-dashed border-stone-200 dark:border-slate-800">
          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <h4 className="text-xs font-bold text-stone-800 dark:text-slate-200">
            {summary.totalExpiringCount === 0
              ? 'All Clear for the Next 30 Days!'
              : 'No services match this filter'}
          </h4>
          <p className="text-[11px] text-stone-500 dark:text-slate-400 max-w-sm mx-auto mt-0.5">
            {summary.totalExpiringCount === 0
              ? 'No SaaS subscriptions or critical renewals are scheduled to lapse in the next 30 days.'
              : 'Try selecting "All Expiring" to see other upcoming subscriptions.'}
          </p>
          {summary.totalExpiringCount === 0 && (
            <button
              onClick={onQuickAddService}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-all active:scale-95"
            >
              <span>+ Log a Service with Renewal Date</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredItems.map((item) => {
            const urgency = getRenewalUrgency(
              item.daysRemaining,
              item.dateType === 'trial',
              item.service.autoRenew,
              item.costInUsd
            );

            return (
              <div
                key={item.service.id}
                className="relative p-3.5 rounded-xl bg-stone-50 dark:bg-slate-900 hover:bg-white dark:hover:bg-slate-800/90 border border-stone-200/90 dark:border-slate-800 hover:border-stone-300 dark:hover:border-slate-700 transition-all shadow-2xs group flex flex-col justify-between"
              >
                <div>
                  {/* Top Status & Urgency Header */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      {/* Color-Coded Status Dot */}
                      <span className="relative flex h-2.5 w-2.5">
                        {item.daysRemaining <= 7 && (
                          <span
                            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                              item.statusLevel === 'overdue' ? 'bg-rose-400' : 'bg-amber-400'
                            }`}
                          />
                        )}
                        <span
                          className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                            item.statusLevel === 'overdue'
                              ? 'bg-rose-500'
                              : item.statusLevel === 'imminent'
                              ? 'bg-amber-500'
                              : item.statusLevel === 'upcoming'
                              ? 'bg-indigo-500'
                              : 'bg-emerald-500'
                          }`}
                        />
                      </span>

                      {/* Color-coded Urgency Badge */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${urgency.colorClass.badge}`}
                      >
                        {item.statusLabel}
                      </span>

                      {item.dateType === 'trial' && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 dark:bg-amber-950/40 border border-amber-500/20 dark:border-amber-900/40">
                          Trial
                        </span>
                      )}
                    </div>

                    {/* Auto-renew pill */}
                    <span
                      className={`text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded ${
                        item.service.autoRenew
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 dark:bg-emerald-950/40 border border-emerald-500/20 dark:border-emerald-900/40'
                          : 'bg-stone-200 dark:bg-slate-800 text-stone-600 dark:text-slate-400 border border-stone-300 dark:border-slate-700'
                      }`}
                    >
                      {item.service.autoRenew ? 'Auto-Renew ON' : 'Manual'}
                    </span>
                  </div>

                  {/* Provider Name & Category */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-stone-900 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {item.service.providerName}
                      </h4>
                      <p className="text-[11px] text-stone-500 dark:text-slate-400 truncate">
                        {item.service.plan} • {item.service.category}
                      </p>
                    </div>

                    {/* Cost Badge */}
                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-extrabold text-stone-900 dark:text-slate-100">
                        {formatCurrency(item.service.cost, item.service.currency)}
                      </div>
                      <div className="text-[9px] text-stone-500 dark:text-slate-400 capitalize">
                        {item.service.billingCycle}
                      </div>
                    </div>
                  </div>

                  {/* Product Association */}
                  <div className="mt-2.5 pt-2 border-t border-stone-200/60 dark:border-slate-800 flex items-center justify-between text-[11px]">
                    <button
                      onClick={() => onSelectProduct(item.productId)}
                      className="flex items-center gap-1 text-stone-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 truncate max-w-[70%]"
                    >
                      <Layers className="w-3 h-3 shrink-0 text-indigo-500" />
                      <span className="truncate">{item.productName}</span>
                    </button>
                    <span className="text-[10px] text-stone-500 dark:text-slate-400 font-mono">
                      {formatDate(item.effectiveDate)}
                    </span>
                  </div>
                </div>

                {/* Card Quick Action Footer */}
                <div className="mt-3 flex items-center justify-between gap-1.5 pt-2 border-t border-stone-200/60 dark:border-slate-800">
                  <button
                    onClick={() => onEditService(item.service)}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-stone-700 dark:text-slate-200 text-[11px] font-semibold transition-colors"
                  >
                    <Edit2 className="w-3 h-3 text-stone-400 dark:text-slate-400" />
                    <span>Manage</span>
                  </button>

                  {item.service.loginUrl && (
                    <a
                      href={item.service.loginUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-stone-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
                      title={`Open ${item.service.providerName} console`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
