import React, { useMemo } from 'react';
import { Wallet, CalendarClock, Globe, AlertTriangle, ChevronRight } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { extractDomainItems } from '../../utils/domainExpiry';
import { formatCurrency } from '../../utils/formatters';
import { relativeDays, summarizeUpcoming } from '../../utils/summary';

interface Props {
  onSelectTab: (tab: string) => void;
}

type Tone = 'neutral' | 'warn' | 'danger' | 'ok';

const toneCls: Record<Tone, string> = {
  neutral: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  warn: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
  danger: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20',
  ok: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

const Card: React.FC<{
  label: string;
  icon: React.ReactNode;
  tone: Tone;
  value: React.ReactNode;
  sub: React.ReactNode;
  onClick: () => void;
}> = ({ label, icon, tone, value, sub, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="group text-left p-4 rounded-2xl bg-white dark:bg-slate-900 border border-stone-200/90 dark:border-slate-800 hover:border-indigo-400/60 dark:hover:border-indigo-500/50 shadow-xs transition-colors min-w-0"
  >
    <div className="flex items-center justify-between gap-2 mb-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-slate-400 truncate">
        {label}
      </span>
      <span className={`w-7 h-7 shrink-0 rounded-lg border flex items-center justify-center ${toneCls[tone]}`}>{icon}</span>
    </div>
    <div className="text-xl font-extrabold text-stone-900 dark:text-slate-100 font-mono tabular-nums truncate">{value}</div>
    <div className="mt-1 flex items-center justify-between gap-1 text-xs text-stone-500 dark:text-slate-400">
      <span className="line-clamp-2 sm:line-clamp-1">{sub}</span>
      <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  </button>
);

/** The four numbers you check first: monthly cost, upcoming renewals, expiring domains, overdue items. */
export const AtAGlanceCards: React.FC<Props> = ({ onSelectTab }) => {
  const { services, dates, products, totalCosts, activeServicesCount, dueSoonGroups, currentWorkspace } = useWorkspace();
  const rate = currentWorkspace.exchangeRates?.ETB_per_USD || 155;

  const upcoming = useMemo(
    () =>
      summarizeUpcoming(
        services,
        extractDomainItems(services, dates, products),
        rate,
        new Date().toLocaleDateString('en-CA')
      ),
    [services, dates, products, rate]
  );
  const overdue = dueSoonGroups.find((g) => g.category === 'overdue')?.items ?? [];

  return (
    <section aria-label="At a glance" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card
        label="Monthly cost"
        icon={<Wallet className="w-4 h-4" />}
        tone="neutral"
        value={formatCurrency(totalCosts.totalUsd, 'USD')}
        sub={formatCurrency(totalCosts.totalEtb, 'ETB')}
        onClick={() => onSelectTab('services')}
      />
      <Card
        label="Next 30 days"
        icon={<CalendarClock className="w-4 h-4" />}
        tone={upcoming.renewals.next && upcoming.renewals.next.daysDiff <= 7 ? 'warn' : 'neutral'}
        value={
          upcoming.renewals.count ? (
            <>
              {upcoming.renewals.count}
              <span className="text-sm font-semibold text-stone-500 dark:text-slate-400">
                {' '}
                · {formatCurrency(upcoming.renewals.totalUsd, 'USD')}
              </span>
            </>
          ) : (
            '0'
          )
        }
        sub={
          upcoming.renewals.next
            ? `${upcoming.renewals.next.title} ${relativeDays(upcoming.renewals.next.daysDiff)}`
            : 'Nothing renews this month'
        }
        onClick={() => onSelectTab('dates')}
      />
      <Card
        label="Domains"
        icon={<Globe className="w-4 h-4" />}
        tone={upcoming.domains.expired ? 'danger' : upcoming.domains.count ? 'warn' : 'ok'}
        value={upcoming.domains.count}
        sub={
          upcoming.domains.next
            ? `${upcoming.domains.next.title} ${
                upcoming.domains.next.daysDiff < 0 ? 'expired ' : 'expires '
              }${relativeDays(upcoming.domains.next.daysDiff)}`
            : 'None expiring in 60 days'
        }
        onClick={() => onSelectTab('dates')}
      />
      <Card
        label="Overdue"
        icon={<AlertTriangle className="w-4 h-4" />}
        tone={overdue.length ? 'danger' : 'ok'}
        value={overdue.length}
        sub={overdue[0] ? `${overdue[0].title} · ${relativeDays(overdue[0].daysDiff)}` : 'All clear'}
        onClick={() => onSelectTab('dates')}
      />
    </section>
  );
};
