import React, { useState, useEffect } from 'react';
import {
  Globe,
  AlertTriangle,
  Clock,
  ExternalLink,
  ShieldAlert,
  CheckCircle2,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  Bell,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import {
  extractDomainItems,
  calculateDomainCountdown,
  advanceDomainYear,
  DomainExpiryItem,
} from '../../utils/domainExpiry';
import { formatCurrency } from '../../utils/formatters';

interface DomainExpiryAlertWidgetProps {
  onSelectProduct?: (productId: string) => void;
  onOpenRegistrar?: (url: string) => void;
}

export const DomainExpiryAlertWidget: React.FC<DomainExpiryAlertWidgetProps> = ({
  onSelectProduct,
}) => {
  const {
    services,
    dates,
    products,
    updateServiceLink,
    updateImportantDate,
    snoozeImportantDate,
  } = useWorkspace();

  const [now, setNow] = useState<Date>(new Date());
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [filterMode, setFilterMode] = useState<'urgent' | 'all'>('urgent');
  const [renewedSuccessId, setRenewedSuccessId] = useState<string | null>(null);

  // Live 1-second ticker for real-time countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const domainItems = extractDomainItems(services, dates, products);

  // Evaluate countdown for each domain item
  const domainsWithCountdown = domainItems.map((item) => ({
    ...item,
    countdown: calculateDomainCountdown(item.dueDate, now),
  }));

  const overdueCount = domainsWithCountdown.filter((d) => d.countdown.isOverdue).length;
  const criticalCount = domainsWithCountdown.filter(
    (d) => d.countdown.isOverdue || d.countdown.days <= 7
  ).length;
  const expiringSoonCount = domainsWithCountdown.filter(
    (d) => !d.countdown.isOverdue && d.countdown.days <= 30
  ).length;

  // Filter items based on mode
  const displayedItems = filterMode === 'urgent'
    ? domainsWithCountdown.filter((d) => d.countdown.isOverdue || d.countdown.days <= 45)
    : domainsWithCountdown;

  // If there are no domain items at all, don't show the widget
  if (domainsWithCountdown.length === 0) {
    return null;
  }

  // Handle "+1 Year Renew"
  const handleRenewOneYear = (item: DomainExpiryItem) => {
    const nextDueDate = advanceDomainYear(item.dueDate);

    if (item.serviceLinkId) {
      updateServiceLink(item.serviceLinkId, { renewalDate: nextDueDate });
    }
    if (item.dateId) {
      updateImportantDate(item.dateId, { dueDate: nextDueDate, status: 'open' });
    }

    setRenewedSuccessId(item.id);
    setTimeout(() => {
      setRenewedSuccessId(null);
    }, 4000);
  };

  const handleSnooze = (item: DomainExpiryItem, days: number) => {
    if (item.dateId) {
      snoozeImportantDate(item.dateId, days);
    }
  };

  return (
    <div
      className={`rounded-2xl transition-all border shadow-md overflow-hidden ${
        overdueCount > 0
          ? 'bg-gradient-to-br from-rose-950/20 via-slate-900 to-slate-900 border-rose-500/40'
          : criticalCount > 0
          ? 'bg-gradient-to-br from-amber-950/20 via-slate-900 to-slate-900 border-amber-500/40'
          : 'bg-slate-900 border-slate-800'
      }`}
    >
      {/* Top Banner Header */}
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
              overdueCount > 0
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse'
                : criticalCount > 0
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
            }`}
          >
            {overdueCount > 0 ? (
              <ShieldAlert className="w-5 h-5 text-rose-400" />
            ) : (
              <Globe className="w-5 h-5 text-indigo-400" />
            )}
          </div>

          <div>
            <div className="flex items-center flex-wrap gap-2">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <span>Domain Registry Expiration Protection</span>
              </h3>

              {overdueCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                  <span>{overdueCount} Domain Overdue!</span>
                </span>
              )}

              {expiringSoonCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>{expiringSoonCount} Expiring within 30d</span>
                </span>
              )}
            </div>

            <p className="text-xs text-slate-400 mt-1">
              Real-time countdown monitors domain registry deadlines to prevent DNS blackout or registration drop.
            </p>
          </div>
        </div>

        {/* Action & Toggle Controls */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          <div className="inline-flex rounded-xl p-0.5 bg-slate-800 border border-slate-700 text-xs">
            <button
              onClick={() => setFilterMode('urgent')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                filterMode === 'urgent'
                  ? 'bg-slate-700 text-slate-100 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Urgent ({domainsWithCountdown.filter((d) => d.countdown.isOverdue || d.countdown.days <= 45).length})
            </button>
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                filterMode === 'all'
                  ? 'bg-slate-700 text-slate-100 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Domains ({domainsWithCountdown.length})
            </button>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 transition-colors"
            title={isExpanded ? 'Collapse section' : 'Expand section'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Domain Cards */}
      {isExpanded && (
        <div className="p-4 sm:p-5 space-y-3">
          {renewedSuccessId && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Domain successfully marked as renewed! Expiration advanced by 1 year (+365 days).
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayedItems.map((item) => {
              const { countdown } = item;
              const isOverdue = countdown.isOverdue;
              const isUrgent = isOverdue || countdown.days <= 7;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                    isOverdue
                      ? 'bg-rose-950/30 border-rose-500/40 shadow-sm shadow-rose-950/50'
                      : isUrgent
                      ? 'bg-amber-950/20 border-amber-500/30 shadow-sm shadow-amber-950/40'
                      : 'bg-slate-800/80 border-slate-700/80'
                  }`}
                >
                  <div>
                    {/* Top Status & Urgency Badge */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                          isOverdue
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                            : isUrgent
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : 'bg-slate-700 text-slate-300 border-slate-600'
                        }`}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        <span>{countdown.urgencyLabel}</span>
                      </span>

                      {/* Auto-renew badge */}
                      {item.autoRenew ? (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>Auto-Renew ON</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          <span>Auto-Renew OFF</span>
                        </span>
                      )}
                    </div>

                    {/* Domain Name */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-base font-black text-slate-100 flex items-center gap-1.5 font-mono">
                          <Globe className="w-4 h-4 text-indigo-400 shrink-0" />
                          <span className="truncate max-w-[200px]" title={item.domainName}>
                            {item.domainName}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-slate-300">{item.provider}</span>
                          <span>•</span>
                          <button
                            onClick={() => item.productId && onSelectProduct && onSelectProduct(item.productId)}
                            className="hover:text-indigo-400 transition-colors underline decoration-slate-600"
                          >
                            {item.productName}
                          </button>
                        </div>
                      </div>

                      {item.cost !== undefined && item.cost > 0 && (
                        <div className="text-right">
                          <div className="text-xs font-bold text-slate-200">
                            {formatCurrency(item.cost, item.currency || 'USD')}
                          </div>
                          <div className="text-[10px] text-slate-500">yearly</div>
                        </div>
                      )}
                    </div>

                    {/* Live Ticking Countdown Box */}
                    <div
                      className={`mt-3 p-2.5 rounded-lg border font-mono flex items-center justify-between text-xs ${
                        isOverdue
                          ? 'bg-rose-950/40 border-rose-600/40 text-rose-200'
                          : isUrgent
                          ? 'bg-amber-950/40 border-amber-600/40 text-amber-200'
                          : 'bg-slate-900/90 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Clock className={`w-3.5 h-3.5 ${isOverdue ? 'text-rose-400 animate-spin' : 'text-amber-400'}`} />
                        <span className="text-[11px] font-medium text-slate-400">
                          {isOverdue ? 'Grace Overdue:' : 'Time Left:'}
                        </span>
                      </div>
                      <div className="font-bold tracking-wider text-xs">
                        {countdown.formattedString}
                      </div>
                    </div>

                    {/* Expiry Date string & Auto-Renew Risk Note */}
                    <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
                      <span>Deadline: <span className="font-mono text-slate-300">{item.dueDate}</span></span>
                      {!item.autoRenew && (
                        <span className="text-amber-400 font-semibold text-[10px]">
                          Manual action required
                        </span>
                      )}
                    </div>

                    {item.notes && (
                      <p className="mt-1.5 text-[11px] text-slate-400 line-clamp-1 italic bg-slate-900/50 p-1.5 rounded-md">
                        {item.notes}
                      </p>
                    )}
                  </div>

                  {/* Quick Action Buttons */}
                  <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between gap-2">
                    {/* Mark Renewed (+1 Year) Button */}
                    <button
                      onClick={() => handleRenewOneYear(item)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-colors shadow-xs active:scale-95"
                      title="Advance domain renewal date by 1 year"
                    >
                      <CalendarCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>+1 Yr Renew</span>
                    </button>

                    {/* Registrar Console Link */}
                    {item.loginUrl ? (
                      <a
                        href={item.loginUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-slate-700/80 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-medium transition-colors"
                        title={`Open registrar console (${item.loginUrl})`}
                      >
                        <span>Registrar</span>
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </a>
                    ) : (
                      <a
                        href={`https://google.com/search?q=${encodeURIComponent(`${item.provider} login`)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-slate-700/80 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-medium transition-colors"
                      >
                        <span>Registrar</span>
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </a>
                    )}

                    {/* Snooze action if important date */}
                    {item.dateId && (
                      <button
                        onClick={() => handleSnooze(item, 7)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors"
                        title="Snooze reminder for 7 days"
                      >
                        <Bell className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
