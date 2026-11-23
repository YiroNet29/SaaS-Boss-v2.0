import React, { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { GetStartedCard } from './GetStartedCard';
import { formatCurrency } from '../../utils/formatters';
import { FALLBACK_ETB_PER_USD } from '../../utils/fx';
import { budgetUse, paidByAppInMonth } from '../../utils/budgets';
import { dueRows, monthlyCostByApp, shortDate, withTrialEnds, type DueRow } from '../../utils/timeline';
import { appServiceLines, budgetLine, sharedCosts, siteName } from '../../utils/portfolio';
import type { ServiceLink } from '../../types';
import { PILL, DOT } from './tones';

interface Props {
  onSelectTab: (tab: string) => void;
  onOpenProductModal: () => void;
  onOpenTemplatePicker: () => void;
  onSelectProduct: (productId: string) => void;
  onOpenServiceModal: () => void;
  onAddServiceTo: (productId: string) => void;
  onEditService: (service: ServiceLink) => void;
}

const SERVICES_PER_APP = 6;
const WEEK_CHIPS = 4;

const usd = (n: number) => formatCurrency(Math.round(n * 100) / 100, 'USD');
const etb = (n: number) => formatCurrency(Math.round(n), 'ETB');

/**
 * The Portfolio layout's Dashboard: every app side by side, each with its monthly cost, budget and the
 * services it pays for; what's due this week at the top; cards and people shared by several apps below.
 */
export const PortfolioDashboard: React.FC<Props> = ({
  onSelectTab,
  onOpenProductModal,
  onOpenTemplatePicker,
  onSelectProduct,
  onOpenServiceModal,
  onAddServiceTo,
  onEditService,
}) => {
  const {
    currentWorkspace,
    products,
    services,
    payments,
    paymentSources,
    sourceTransactions,
    dueSoonGroups,
    overdueCount,
    totalCosts,
    isDemoMode,
    todayStr,
  } = useWorkspace();
  const rate = currentWorkspace.exchangeRates?.ETB_per_USD || FALLBACK_ETB_PER_USD;
  const today = todayStr;
  const month = today.slice(0, 7);

  const apps = useMemo(() => monthlyCostByApp(products, services, rate), [products, services, rate]);
  const paidThisMonth = useMemo(() => paidByAppInMonth(payments, services, month, rate), [payments, services, month, rate]);
  const week = useMemo(
    () => withTrialEnds(dueRows(dueSoonGroups, rate, 7), services, products, today, 7).filter((r) => r.daysDiff >= 0),
    [dueSoonGroups, rate, services, products, today]
  );
  const shared = useMemo(
    () => sharedCosts({ sources: paymentSources, payments, transactions: sourceTransactions, services, today, etbPerUsd: rate }),
    [paymentSources, payments, sourceTransactions, services, today, rate]
  );

  const openRow = (r: DueRow) => (r.service ? onEditService(r.service) : onSelectTab('dates'));
  // Two chips with the same name (Railway for two apps) also say which app.
  const repeated = new Set(week.map((r) => r.name).filter((n, i, all) => all.indexOf(n) !== i));

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      <GetStartedCard
        onAddApp={onOpenProductModal}
        onUseTemplate={onOpenTemplatePicker}
        onAddService={onOpenServiceModal}
        onSelectTab={onSelectTab}
      />

      {/* Title, and what's due this week */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2 min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
            {currentWorkspace.name}
            {isDemoMode ? ' · Example data' : ''}
          </p>
          <h1 className="text-4xl md:text-[44px] leading-[1.05] font-bold tracking-tight text-slate-100">
            {apps.length} app{apps.length === 1 ? '' : 's'}, {usd(totalCosts.totalUsd)} a month
          </h1>
          <p className="text-[15px] text-slate-300">{etb(totalCosts.totalEtb)} a month · what each app pays for, side by side</p>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Due this week">
          <span className="text-sm text-slate-400">Due this week:</span>
          {overdueCount > 0 && (
            <button
              type="button"
              onClick={() => onSelectTab('dates')}
              className={`text-sm font-semibold px-3 py-1.5 rounded-full ${PILL.overdue}`}
            >
              {overdueCount} overdue
            </button>
          )}
          {week.slice(0, WEEK_CHIPS).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => openRow(r)}
              className={`text-sm font-semibold px-3 py-1.5 rounded-full ${PILL[r.tone === 'auto' ? 'auto' : r.tone === 'date' ? 'date' : 'warn']}`}
            >
              {r.name}
              {repeated.has(r.name) ? ` (${r.appName})` : ''} · {shortDate(r.dueDate)}
              {r.usd !== undefined ? ` · ${usd(r.usd)}` : ''}
            </button>
          ))}
          {week.length > WEEK_CHIPS && (
            <button type="button" onClick={() => onSelectTab('dates')} className="text-sm font-medium text-indigo-400 hover:text-indigo-300">
              +{week.length - WEEK_CHIPS} more
            </button>
          )}
          {week.length === 0 && overdueCount === 0 && <span className="text-sm text-slate-300">nothing</span>}
        </div>
      </div>

      {/* One column per app */}
      <div className="flex flex-wrap gap-4 items-start">
        {apps.map((app) => {
          const lines = appServiceLines(services, app.product.id, today);
          const budget = budgetLine(budgetUse(app.product.monthlyBudget, paidThisMonth.get(app.product.id) ?? 0));
          const site = siteName(app.product.liveUrl);
          const headingId = `app-${app.product.id}`;
          return (
            <section
              key={app.product.id}
              aria-labelledby={headingId}
              className="flex-[1_1_300px] min-w-0 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex flex-col"
            >
              <div className="px-5 pt-5 pb-4 space-y-2.5 border-b border-slate-800">
                <div className="min-w-0">
                  <h2 id={headingId} className="text-2xl font-bold text-slate-100">
                    <button type="button" onClick={() => onSelectProduct(app.product.id)} className="block w-full text-left hover:underline truncate">
                      {app.product.name}
                    </button>
                  </h2>
                  {site && <p className="text-xs text-slate-400 truncate mt-0.5">{site}</p>}
                </div>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[28px] font-semibold text-slate-100 tabular-nums">{usd(app.monthlyUsd)}</span>
                  <span className="text-sm text-slate-400">a month · {etb(app.monthlyEtb)}</span>
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden" aria-hidden="true">
                    {budget.tone !== 'none' && (
                      <div className={`h-full rounded-full ${DOT[budget.tone]}`} style={{ width: `${budget.width}%` }} />
                    )}
                  </div>
                  <p className="text-xs text-slate-400">{budget.text}</p>
                </div>
              </div>

              {lines.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-400">No services yet.</p>
              ) : (
                <ul>
                  {lines.slice(0, SERVICES_PER_APP).map((l) => (
                    <li key={l.service.id} className="border-b border-slate-800">
                      <button
                        type="button"
                        onClick={() => onEditService(l.service)}
                        className="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-5 py-3 hover:bg-slate-800/50 transition-colors"
                      >
                        <span className="text-sm font-semibold text-slate-100 truncate">{l.name}</span>
                        <span className="text-sm text-slate-200 text-right whitespace-nowrap">{l.price}</span>
                        <span className="text-xs text-slate-400 truncate">{l.kind}</span>
                        <span className={`justify-self-end text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${PILL[l.tone]}`}>
                          {l.when}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {lines.length > SERVICES_PER_APP && (
                <button
                  type="button"
                  onClick={() => onSelectProduct(app.product.id)}
                  className="px-5 py-2.5 text-sm text-left text-slate-300 hover:text-slate-100 border-b border-slate-800"
                >
                  {lines.length - SERVICES_PER_APP} more on its page
                </button>
              )}
              <button
                type="button"
                onClick={() => onAddServiceTo(app.product.id)}
                className="mt-auto flex items-center gap-2 min-h-[48px] px-5 text-sm font-semibold text-left text-indigo-400 hover:text-indigo-300"
              >
                <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate">Add a service to {app.product.name}</span>
              </button>
            </section>
          );
        })}

        <div className="flex-[1_1_220px] sm:flex-[0_1_220px] min-h-[220px] rounded-2xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center gap-2 p-5 text-center">
          <button type="button" onClick={onOpenProductModal} className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 hover:bg-slate-800/50">
            <Plus className="w-7 h-7 text-indigo-400" aria-hidden="true" />
            <span className="text-[15px] font-semibold text-slate-100">Add an app</span>
          </button>
          <button type="button" onClick={onOpenTemplatePicker} className="text-sm text-slate-300 hover:text-slate-100 underline underline-offset-2">
            or start from a template
          </button>
        </div>
      </div>

      {/* Cards and people shared by several apps */}
      {shared.length > 0 && (
        <section aria-labelledby="shared-heading" className="space-y-3">
          <h2 id="shared-heading" className="text-xl font-bold text-slate-100">
            Shared costs
          </h2>
          <div className="flex flex-wrap gap-4">
            {shared.slice(0, 4).map((c) => (
              <button
                key={c.source.id}
                type="button"
                onClick={() => onSelectTab('money')}
                className="flex-[1_1_320px] min-w-0 text-left rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 transition-colors px-5 py-4 flex flex-wrap justify-between items-center gap-2.5"
              >
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-slate-100 truncate">{c.title}</span>
                  <span className="block text-sm text-slate-400">{c.sub}</span>
                </span>
                <span className={`text-sm font-semibold px-3 py-1.5 rounded-full whitespace-nowrap ${PILL[c.tone]}`}>{c.status}</span>
              </button>
            ))}
          </div>
          {shared.length > 4 && (
            <button type="button" onClick={() => onSelectTab('money')} className="text-sm font-medium text-indigo-400 hover:text-indigo-300">
              {shared.length - 4} more in Cards & payments
            </button>
          )}
        </section>
      )}
    </div>
  );
};
