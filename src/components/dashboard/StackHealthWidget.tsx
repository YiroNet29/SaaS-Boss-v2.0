import React, { useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  RefreshCw,
  Server,
  Calendar,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

interface StackHealthWidgetProps {
  onOpenVaultModal: () => void;
  onSelectTab: (tab: string) => void;
}

export const StackHealthWidget: React.FC<StackHealthWidgetProps> = ({
  onOpenVaultModal,
  onSelectTab,
}) => {
  const { stackHealth } = useWorkspace();
  const [isExpanded, setIsExpanded] = useState(false);

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    if (score >= 75) return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30';
    if (score >= 60) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'security':
        return KeyRound;
      case 'renewals':
        return RefreshCw;
      case 'resilience':
        return Server;
      default:
        return Calendar;
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">SaaS Stack Health & Audit</h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getScoreColor(stackHealth.score)}`}>
                Grade {stackHealth.grade} ({stackHealth.score}/100)
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Continuously audits secret leak safety, auto-renew exposure, and provider concentration
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
        >
          <span>{isExpanded ? 'Collapse Audit Details' : 'View Full Audit Breakdown'}</span>
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* 4 Pillars Summary Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-3">
        {stackHealth.checks.map((check) => {
          const Icon = getCategoryIcon(check.category);
          const isOptimal = check.status === 'optimal';
          const isWarn = check.status === 'warning';

          return (
            <div
              key={check.id}
              className={`p-2.5 rounded-xl border transition-colors ${
                isOptimal
                  ? 'bg-slate-850/50 border-slate-800'
                  : isWarn
                  ? 'bg-amber-500/5 border-amber-500/20'
                  : 'bg-rose-500/5 border-rose-500/25'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-slate-300 font-semibold text-xs truncate">
                  <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{check.name}</span>
                </div>
                {isOptimal ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : isWarn ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                )}
              </div>

              <div className="text-[11px] text-slate-400 line-clamp-1 mb-1">
                {check.summary}
              </div>

              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-500">{check.score} / {check.maxScore} pts</span>
                {check.actionLabel && (
                  <button
                    onClick={() => {
                      if (check.id === 'secret-shield') onOpenVaultModal();
                      else if (check.id === 'auto-renew-guard') onSelectTab('services');
                      else onSelectTab('dates');
                    }}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    {check.actionLabel} &rarr;
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded recommendations and details */}
      {isExpanded && (
        <div className="mt-3.5 pt-3 border-t border-slate-800 space-y-2 animate-in fade-in">
          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
            Actionable Founder Recommendations
          </div>
          {stackHealth.recommendations.length > 0 ? (
            <div className="space-y-1.5">
              {stackHealth.recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-slate-300 bg-slate-850 p-2 rounded-lg border border-slate-800">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{rec}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-emerald-400 flex items-center gap-1.5 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4" />
              <span>All 4 SaaS stack health checks are optimal! Zero unreferenced secrets, healthy provider balance, and full renewal tracking.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
