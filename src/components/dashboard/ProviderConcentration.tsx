import React from 'react';
import { ShieldAlert, Server } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { formatCurrency } from '../../utils/formatters';

export const ProviderConcentration: React.FC<{ onSelectProvider?: (providerName: string) => void }> = ({
  onSelectProvider,
}) => {
  const { providerConcentration, products } = useWorkspace();

  if (!providerConcentration.length) {
    return null;
  }

  const topProvider = providerConcentration[0];

  return (
    <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-400" />
            <span>Provider Concentration & Blast Radius</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Identify single points of failure across your {products.length} SaaS products in case of outages or price hikes.
          </p>
        </div>

        {topProvider && topProvider.percentage >= 50 && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-medium self-start sm:self-auto">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>High Concentration Risk: {topProvider.providerName} ({topProvider.percentage}%)</span>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {providerConcentration.slice(0, 6).map((item) => {
          const isHighRisk = item.percentage >= 60;
          const isMediumRisk = item.percentage >= 35 && item.percentage < 60;

          return (
            <div
              key={item.providerName}
              onClick={() => onSelectProvider && onSelectProvider(item.providerName)}
              className="p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/70 border border-slate-750 transition-colors cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-slate-200 group-hover:text-indigo-300 transition-colors">
                    {item.providerName}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    ({item.serviceCount} service{item.serviceCount > 1 ? 's' : ''})
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-medium text-slate-300">
                    {formatCurrency(item.monthlyCostUsd, 'USD')}/mo
                  </span>
                  <span
                    className={`text-xs font-bold font-mono px-2 py-0.5 rounded-md ${
                      isHighRisk
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : isMediumRisk
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {item.productCount} of {item.totalProducts} ({item.percentage}%)
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isHighRisk
                      ? 'bg-rose-500'
                      : isMediumRisk
                      ? 'bg-amber-500'
                      : 'bg-indigo-500'
                  }`}
                  style={{ width: `${Math.min(item.percentage, 100)}%` }}
                />
              </div>

              {/* Category tags */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.categories.map((cat) => (
                  <span
                    key={cat}
                    className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-800 text-slate-400 capitalize"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
