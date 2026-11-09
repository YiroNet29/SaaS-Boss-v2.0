import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { formatCurrency, formatDate, formatDaysDiff } from '../../utils/formatters';

interface DueSoonSectionProps {
  onSnoozeItem: (id: string, days: number) => void;
  onMarkDone: (id: string) => void;
  onSelectProduct: (productId: string) => void;
  onOpenDateModal: (id: string) => void;
}

export const DueSoonSection: React.FC<DueSoonSectionProps> = ({
  onSnoozeItem,
  onMarkDone,
  onSelectProduct,
  onOpenDateModal,
}) => {
  const { dueSoonGroups } = useWorkspace();
  const [activeGroupFilter, setActiveGroupFilter] = useState<string>('all');
  const [customDaysWindow, setCustomDaysWindow] = useState<number>(60);
  const [isCustomOpen, setIsCustomOpen] = useState(false);

  // Flatten items for display
  const allGroups = dueSoonGroups;

  // Filter groups
  const visibleGroups = activeGroupFilter === 'all'
    ? allGroups
    : allGroups.filter((g) => g.category === activeGroupFilter);

  const totalItemsCount = allGroups.reduce((acc, g) => acc + g.items.length, 0);

  return (
    <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-4">
      {/* Header & Filter Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-100">
              Due Soon & Renewals Timeline
            </h3>
            <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
              {totalItemsCount}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Aggregated renewals, domain expiries, key rotations, and invoice deadlines.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
          <button
            onClick={() => setActiveGroupFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              activeGroupFilter === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            All Windows
          </button>
          {allGroups.map((g) => (
            <button
              key={g.category}
              onClick={() => setActiveGroupFilter(g.category)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                activeGroupFilter === g.category
                  ? g.category === 'overdue'
                    ? 'bg-rose-600 text-white'
                    : 'bg-indigo-600 text-white'
                  : g.category === 'overdue' && g.items.length > 0
                  ? 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{g.label}</span>
              <span className="text-[10px] opacity-75">({g.items.length})</span>
            </button>
          ))}

          {/* Custom Window Toggle */}
          <button
            onClick={() => setIsCustomOpen(!isCustomOpen)}
            className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="Configure custom days window"
            aria-label="Custom window"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Custom Window Configuration Drawer */}
      {isCustomOpen && (
        <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-750 text-xs flex flex-wrap items-center gap-4 animate-in fade-in">
          <span className="font-semibold text-slate-200">Custom Outlook Window:</span>
          <div className="flex items-center gap-2">
            {[45, 60, 90, 180].map((days) => (
              <button
                key={days}
                onClick={() => setCustomDaysWindow(days)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                  customDaysWindow === days
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-650'
                }`}
              >
                {days} Days
              </button>
            ))}
          </div>
          <span className="text-slate-400">
            Currently highlighting tasks within {customDaysWindow} days.
          </span>
        </div>
      )}

      {/* Grouped Lists */}
      <div className="space-y-4">
        {visibleGroups.map((group) => {
          if (!group.items.length) {
            if (activeGroupFilter === 'all') return null;
            return (
              <div key={group.category} className="p-4 text-center text-xs text-slate-500 bg-slate-800/20 rounded-xl">
                No items in {group.label}.
              </div>
            );
          }

          const isOverdueGroup = group.category === 'overdue';

          return (
            <div key={group.category} className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                <span className={isOverdueGroup ? 'text-rose-400 flex items-center gap-1.5' : ''}>
                  {isOverdueGroup && <AlertTriangle className="w-3.5 h-3.5" />}
                  {group.label} ({group.items.length})
                </span>
              </div>

              <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-800/30 overflow-hidden">
                {group.items.map((item) => {
                  const daysMeta = formatDaysDiff(item.daysDiff);

                  return (
                    <div
                      key={item.id}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                            daysMeta.urgency === 'overdue'
                              ? 'bg-rose-500 animate-ping'
                              : daysMeta.urgency === 'urgent'
                              ? 'bg-amber-400'
                              : 'bg-indigo-400'
                          }`}
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-xs text-slate-100">{item.title}</span>
                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/80">
                              {item.productName}
                            </span>
                            {item.dateType && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 capitalize">
                                {item.dateType}
                              </span>
                            )}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              Due: {formatDate(item.dueDate)}
                            </span>
                            <span
                              className={`font-semibold ${
                                daysMeta.urgency === 'overdue'
                                  ? 'text-rose-400'
                                  : daysMeta.urgency === 'urgent'
                                  ? 'text-amber-300'
                                  : 'text-slate-300'
                              }`}
                            >
                              ({daysMeta.label})
                            </span>
                            {item.amount !== undefined && item.currency && (
                              <span className="font-mono text-emerald-400">
                                {formatCurrency(item.amount, item.currency)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Item Quick Actions */}
                      <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                        {item.type === 'date' && (
                          <>
                            <button
                              onClick={() => onMarkDone(item.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-medium flex items-center gap-1 transition-colors"
                              title="Mark Done (will auto-schedule next date if recurring)"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Done</span>
                            </button>
                            <button
                              onClick={() => onSnoozeItem(item.id, 7)}
                              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 text-xs font-medium transition-colors"
                              title="Snooze 7 days"
                            >
                              +7d
                            </button>
                          </>
                        )}

                        {item.type === 'renewal' && item.rawServiceItem?.loginUrl && (
                          <a
                            href={item.rawServiceItem.loginUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 text-xs font-medium flex items-center gap-1 transition-colors"
                            title="Open Provider Login Page"
                          >
                            <span>Login</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}

                        {item.productId && (
                          <button
                            onClick={() => onSelectProduct(item.productId!)}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                            title="Go to product details"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
