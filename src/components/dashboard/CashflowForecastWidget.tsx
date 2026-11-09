import React, { useState } from 'react';
import {
  TrendingUp,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { formatCurrency } from '../../utils/formatters';

export const CashflowForecastWidget: React.FC = () => {
  const { cashflowForecast, currentWorkspace } = useWorkspace();
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | null>(null);

  if (!cashflowForecast || cashflowForecast.length === 0) return null;

  // Max USD for bar height scaling
  const maxUsd = Math.max(...cashflowForecast.map((f) => f.totalUsd), 50);

  const selectedMonth = selectedMonthIndex !== null ? cashflowForecast[selectedMonthIndex] : null;

  return (
    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">12-Month Renewal Cashflow Forecast</h3>
            <p className="text-[11px] text-slate-400">
              Projects cash needed each month, highlighting annual renewals and price spikes
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-mono">
          <span>Base: {currentWorkspace.baseCurrency}</span>
          <span>•</span>
          <span>1 USD = {currentWorkspace.exchangeRates.ETB_per_USD} ETB</span>
        </div>
      </div>

      {/* 12-Month Bar Chart */}
      <div className="mt-4 pt-2">
        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 items-end h-32 px-1">
          {cashflowForecast.map((m, idx) => {
            const heightPercent = Math.max(12, Math.round((m.totalUsd / maxUsd) * 100));
            const isSpike = m.totalUsd > maxUsd * 0.75;
            const isSelected = selectedMonthIndex === idx;

            return (
              <button
                key={m.monthKey}
                onClick={() => setSelectedMonthIndex(selectedMonthIndex === idx ? null : idx)}
                className="flex flex-col items-center justify-end h-full group focus:outline-hidden"
              >
                <div className="text-[9px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity mb-1">
                  ${Math.round(m.totalUsd)}
                </div>
                <div
                  style={{ height: `${heightPercent}%` }}
                  className={`w-full rounded-t-md transition-all ${
                    isSelected
                      ? 'bg-indigo-500 shadow-md shadow-indigo-500/50'
                      : isSpike
                      ? 'bg-gradient-to-t from-violet-600 to-rose-500 opacity-90 group-hover:opacity-100'
                      : 'bg-indigo-600/60 hover:bg-indigo-500'
                  }`}
                />
                <div className="text-[10px] text-slate-400 font-mono mt-1.5 truncate max-w-full">
                  {m.monthLabel.split(' ')[0]}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail inspect of selected or current month */}
      {selectedMonth ? (
        <div className="mt-3 p-3 rounded-xl bg-slate-850 border border-slate-750 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-slate-200">{selectedMonth.monthLabel}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-indigo-500/20 text-indigo-300 font-mono">
                {selectedMonth.renewalCount} renewal(s)
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Top renewal costs:{' '}
              {selectedMonth.topRenewals.length > 0
                ? selectedMonth.topRenewals.map((r) => `${r.serviceName} ($${Math.round(r.costUsd)})`).join(', ')
                : 'Regular monthly amortized baseline'}
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-xs font-mono font-bold text-slate-100">
              {formatCurrency(selectedMonth.totalUsd, 'USD')}
            </div>
            <div className="text-[10px] font-mono font-semibold text-emerald-400">
              {formatCurrency(selectedMonth.totalEtb, 'ETB')}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-2 text-center text-[11px] text-slate-500">
          Click any month bar to inspect renewals and cost breakdown
        </div>
      )}
    </div>
  );
};
