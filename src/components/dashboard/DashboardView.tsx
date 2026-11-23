import React, { lazy, Suspense, useRef, useState } from 'react';
import {
  Sparkles,
  Layers,
  Calendar,
  Download,
  PieChart,
  ArrowUpRight,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { RateStaleBanner } from './RateStaleBanner';
import { AtAGlanceCards } from './AtAGlanceCards';
import { GetStartedCard } from './GetStartedCard';
import { MoneyAlertsBanner } from './MoneyAlertsBanner';
import { DueSoonSection } from './DueSoonSection';
import { ProviderConcentration } from './ProviderConcentration';
import { StackHealthWidget } from './StackHealthWidget';
import { CashflowForecastWidget } from './CashflowForecastWidget';
import { RenewalSpotlightWidget } from './RenewalSpotlightWidget';
import { DomainExpiryAlertWidget } from './DomainExpiryAlertWidget';
import { formatCurrency } from '../../utils/formatters';
import { generateICS, downloadICS } from '../../utils/ics';
import { exportServicesToCSV, downloadFile } from '../../utils/csv';
import { ServiceLink } from '../../types';
import { useSensitiveAction } from '../../context/LockContext';
import { FALLBACK_ETB_PER_USD } from '../../utils/fx';
import { monthlyCostByApp } from '../../utils/timeline';

// The chart library is the biggest single part of the app: it loads just after the Dashboard appears.
const MonthlySpendTrendChart = lazy(() => import('./MonthlySpendTrendChart').then((m) => ({ default: m.MonthlySpendTrendChart })));

type ComingTab = 'due' | 'renewals' | 'domains';
const COMING_TABS: { id: ComingTab; label: string }[] = [
  { id: 'due', label: 'Everything due' },
  { id: 'renewals', label: 'Renewals' },
  { id: 'domains', label: 'Domains' },
];

/** A small uppercase heading that names a group of boxes. */
const SectionHeading: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => (
  <h2 id={id} className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
    {children}
  </h2>
);

/** Tabs that switch what one box shows. Arrow keys move between them. */
function SectionTabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const move = (from: number, step: number) => {
    const next = (from + step + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
      {tabs.map((t, i) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${slug}-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`${slug}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') move(i, 1);
              else if (e.key === 'ArrowLeft') move(i, -1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selected ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

interface DashboardViewProps {
  onSelectTab: (tab: string) => void;
  onOpenProductModal: () => void;
  onOpenTemplatePicker: () => void;
  onSelectProduct: (productId: string) => void;
  onOpenServiceModal: () => void;
  onEditService?: (service: ServiceLink) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onSelectTab,
  onOpenProductModal,
  onOpenTemplatePicker,
  onSelectProduct,
  onOpenServiceModal,
  onEditService,
}) => {
  const {
    currentWorkspace,
    products,
    services,
    dates,
    categoryBreakdown,
    snoozeImportantDate,
    markDateDone,
    isDemoMode,
  } = useWorkspace();
  const sensitive = useSensitiveAction();
  const [comingTab, setComingTab] = useState<ComingTab>('due');

  const handleExportICS = async () => {
    if (!(await sensitive('export your calendar', { exportOf: 'Calendar (.ics)' }))) return;
    const icsContent = generateICS(dates, services, products, currentWorkspace.name);
    downloadICS(icsContent, `stacktrack-${currentWorkspace.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.ics`);
  };

  const handleExportCSV = async () => {
    if (!(await sensitive('export your services', { exportOf: 'Services CSV' }))) return;
    const rate = currentWorkspace.exchangeRates.ETB_per_USD || FALLBACK_ETB_PER_USD;
    const csvContent = exportServicesToCSV(products, services, rate);
    downloadFile(
      csvContent,
      `stacktrack-${currentWorkspace.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-services.csv`,
      'text/csv'
    );
  };

  // What each app costs a month (shared with the Timeline layout)
  const productCosts = monthlyCostByApp(products, services, currentWorkspace.exchangeRates.ETB_per_USD || FALLBACK_ETB_PER_USD);

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Welcome & Quick Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold text-slate-100 tracking-tight">
              Overview
            </h2>
            {isDemoMode && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Demo Stacks
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Services, renewals and dates for{' '}
            <span className="text-indigo-400 font-semibold">{currentWorkspace.name}</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenTemplatePicker}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/30 text-indigo-300 text-xs font-semibold transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Use a template</span>
          </button>

          <button
            onClick={handleExportICS}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 text-xs font-medium transition-colors"
            title="Download iCalendar file (.ics) for Apple/Google Calendar"
          >
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Export .ics</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-colors"
            title="Download full CSV spreadsheet for backup, taxes, or accounting"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* First steps for a new workspace, each with its button */}
      <GetStartedCard
        onAddApp={onOpenProductModal}
        onUseTemplate={onOpenTemplatePicker}
        onAddService={onOpenServiceModal}
        onSelectTab={onSelectTab}
      />

      {/* The numbers you check first, and anything that needs money now */}
      <RateStaleBanner onOpenSettings={() => onSelectTab('settings')} />
      <AtAGlanceCards onSelectTab={onSelectTab} />
      <MoneyAlertsBanner onOpen={() => onSelectTab('money')} />

      {/* Coming up: one box with three views of what's due */}
      <section aria-labelledby="coming-up-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading id="coming-up-heading">Coming up</SectionHeading>
          <SectionTabs<ComingTab> label="Coming up" tabs={COMING_TABS} value={comingTab} onChange={setComingTab} />
        </div>
        <div role="tabpanel" id="coming-up-panel" aria-labelledby={`coming-up-tab-${comingTab}`}>
          {comingTab === 'due' && (
            <DueSoonSection
              onSnoozeItem={(id, days) => snoozeImportantDate(id, days)}
              onMarkDone={(id) => markDateDone(id)}
              onSelectProduct={(pId) => onSelectProduct(pId)}
              onOpenDateModal={() => onSelectTab('dates')}
            />
          )}
          {comingTab === 'renewals' && (
            <RenewalSpotlightWidget
              onEditService={(s) => {
                if (onEditService) onEditService(s);
                else onOpenServiceModal();
              }}
              onSelectProduct={onSelectProduct}
              onSelectTab={onSelectTab}
              onQuickAddService={onOpenServiceModal}
            />
          )}
          {comingTab === 'domains' && <DomainExpiryAlertWidget onSelectProduct={onSelectProduct} />}
        </div>
      </section>

      {/* Spending: the last six months, the next twelve, and where the money goes */}
      <section aria-labelledby="spending-heading" className="space-y-3">
        <SectionHeading id="spending-heading">Spending</SectionHeading>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          <Suspense
            fallback={
              <div
                role="status"
                className="h-96 rounded-2xl bg-white dark:bg-slate-900 border border-stone-200/90 dark:border-slate-800 flex items-center justify-center text-sm text-slate-400"
              >
                Loading the spending chart…
              </div>
            }
          >
            <MonthlySpendTrendChart onSelectTab={onSelectTab} />
          </Suspense>
          <CashflowForecastWidget />
        </div>

      {/* Spend Breakdowns (Per Product & Per Category) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Product Cost Distribution */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span>Monthly cost by app</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                What each app costs per month
              </p>
            </div>
            <button
              onClick={() => onSelectTab('products')}
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5"
            >
              <span>View all</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-3">
            {productCosts.length > 0 ? (
              productCosts.map((item) => (
                <div
                  key={item.product.id}
                  onClick={() => onSelectProduct(item.product.id)}
                  className="p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/70 border border-slate-750 transition-colors cursor-pointer group flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-xs text-slate-200 group-hover:text-indigo-300 transition-colors">
                      {item.product.name}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {item.serviceCount} services • status: {item.product.status}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-xs font-bold text-slate-100">
                      {formatCurrency(item.monthlyUsd, 'USD')}
                    </div>
                    <div className="font-mono text-[11px] text-emerald-400">
                      {formatCurrency(item.monthlyEtb, 'ETB')}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-xs text-slate-500">
                No apps yet. Use a template, or add your first app.
              </div>
            )}
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-violet-400" />
                <span>Spend by Category</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Hosting, database, registrar, auth, email, and tooling
              </p>
            </div>
            <button
              onClick={() => onSelectTab('services')}
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5"
            >
              <span>Manage</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2.5">
            {categoryBreakdown.length > 0 ? (
              categoryBreakdown.slice(0, 6).map((cat) => (
                <div
                  key={cat.category}
                  className="p-2.5 rounded-xl bg-slate-800/30 border border-slate-750 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-200 capitalize">
                      {cat.category}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      ({cat.count})
                    </span>
                  </div>
                  <div className="text-right font-mono text-xs font-semibold text-slate-200">
                    {formatCurrency(cat.costUsd, 'USD')}
                    <span className="text-slate-500 text-[10px] ml-1">/mo</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-xs text-slate-500">
                No active services recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>
      </section>

      {/* Health: the stack check, and the providers you rely on most */}
      <section aria-labelledby="health-heading" className="space-y-3">
        <SectionHeading id="health-heading">Health</SectionHeading>
        <div className="space-y-4">
          <StackHealthWidget onSelectTab={onSelectTab} />
          <ProviderConcentration onSelectProvider={() => onSelectTab('services')} />
        </div>
      </section>
    </div>
  );
};
