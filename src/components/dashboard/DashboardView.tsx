import React from 'react';
import {
  Sparkles,
  Layers,
  Link2,
  Calendar,
  Download,
  Plus,
  Server,
  PieChart,
  ArrowUpRight,
  DownloadCloud,
  FileCode,
  ShieldCheck,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { CostSummaryCard } from './CostSummaryCard';
import { AtAGlanceCards } from './AtAGlanceCards';
import { DueSoonSection } from './DueSoonSection';
import { ProviderConcentration } from './ProviderConcentration';
import { StackHealthWidget } from './StackHealthWidget';
import { CashflowForecastWidget } from './CashflowForecastWidget';
import { RenewalSpotlightWidget } from './RenewalSpotlightWidget';
import { MonthlySpendTrendChart } from './MonthlySpendTrendChart';
import { DomainExpiryAlertWidget } from './DomainExpiryAlertWidget';
import { formatCurrency } from '../../utils/formatters';
import { generateICS, downloadICS } from '../../utils/ics';
import { exportServicesToCSV, downloadFile } from '../../utils/csv';
import { ServiceLink } from '../../types';

interface DashboardViewProps {
  onSelectTab: (tab: string) => void;
  onOpenProductModal: () => void;
  onOpenTemplatePicker: () => void;
  onSelectProduct: (productId: string) => void;
  onOpenServiceModal: () => void;
  onOpenVaultModal: () => void;
  onEditService?: (service: ServiceLink) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onSelectTab,
  onOpenProductModal,
  onOpenTemplatePicker,
  onSelectProduct,
  onOpenServiceModal,
  onOpenVaultModal,
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
    setDemoMode,
    importDemoStacksIntoLive,
  } = useWorkspace();

  const handleExportICS = () => {
    const icsContent = generateICS(dates, services, products, currentWorkspace.name);
    downloadICS(icsContent, `stacktrack-${currentWorkspace.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.ics`);
  };

  const handleExportCSV = () => {
    const rate = currentWorkspace.exchangeRates.ETB_per_USD || 130;
    const csvContent = exportServicesToCSV(products, services, rate);
    downloadFile(
      csvContent,
      `stacktrack-${currentWorkspace.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-services.csv`,
      'text/csv'
    );
  };

  // Product cost breakdown
  const productCosts = products.map((prod) => {
    const prodServices = services.filter((s) => s.productId === prod.id && s.status !== 'cancelled');
    const rate = currentWorkspace.exchangeRates.ETB_per_USD || 130;
    let monthlyUsd = 0;
    for (const s of prodServices) {
      const baseMonthly = s.billingCycle === 'yearly' ? s.cost / 12 : s.billingCycle === 'monthly' ? s.cost : 0;
      const inUsd = s.currency === 'ETB' ? baseMonthly / rate : baseMonthly;
      monthlyUsd += inUsd;
    }
    return {
      product: prod,
      monthlyUsd: Math.round(monthlyUsd * 100) / 100,
      monthlyEtb: Math.round(monthlyUsd * rate * 100) / 100,
      serviceCount: prodServices.length,
    };
  }).sort((a, b) => b.monthlyUsd - a.monthlyUsd);

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Welcome & Quick Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold text-slate-100 tracking-tight">
              Founder Stack Overview
            </h2>
            {isDemoMode && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Demo Stacks
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Tracking services, renewals, and credentials for{' '}
            <span className="text-indigo-400 font-semibold">{currentWorkspace.name}</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenTemplatePicker}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/30 text-indigo-300 text-xs font-semibold transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Stamp Template</span>
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

      {/* Empty State when in Live Workspace with zero products */}
      {!isDemoMode && products.length === 0 && (
        <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-50/90 via-stone-50/60 to-violet-50/70 dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900 border border-indigo-200/80 dark:border-indigo-500/30 shadow-md text-center transition-all">
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-600/20 border border-indigo-200 dark:border-indigo-500/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mx-auto mb-3">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-stone-900 dark:text-slate-100 mb-1">
            Welcome to your live workspace!
          </h3>
          <p className="text-xs text-stone-600 dark:text-slate-400 max-w-lg mx-auto mb-4 leading-relaxed">
            Your live workspace is empty and ready for your real SaaS products. You can start from scratch, stamp out a template, or import the pre-configured demo stacks.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={importDemoStacksIntoLive}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md transition-all active:scale-95"
            >
              <DownloadCloud className="w-4 h-4" />
              <span>Import Demo Stacks into Live</span>
            </button>
            <button
              onClick={onOpenTemplatePicker}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-stone-100 dark:hover:bg-slate-750 border border-stone-200 dark:border-slate-700 text-stone-700 dark:text-slate-200 font-semibold text-xs transition-colors shadow-xs"
            >
              <FileCode className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Use a Starter Template</span>
            </button>
            <button
              onClick={onOpenProductModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-stone-100 dark:hover:bg-slate-750 border border-stone-200 dark:border-slate-700 text-stone-700 dark:text-slate-200 font-semibold text-xs transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Add Your First App</span>
            </button>
            <button
              onClick={() => setDemoMode(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-semibold text-xs hover:bg-amber-500/20 transition-colors shadow-xs"
            >
              <Sparkles className="w-4 h-4" />
              <span>Switch to Demo Mode</span>
            </button>
          </div>
        </div>
      )}

      {/* At-a-glance numbers */}
      <AtAGlanceCards onSelectTab={onSelectTab} />

      {/* SaaS Stack Health & Security Audit Widget */}
      <StackHealthWidget
        onOpenVaultModal={onOpenVaultModal}
        onSelectTab={onSelectTab}
      />

      {/* Automated Domain Registry Expiration Notification System with Live Countdown */}
      <DomainExpiryAlertWidget onSelectProduct={onSelectProduct} />

      {/* Top Cost & Metric Cards */}
      <CostSummaryCard
        onOpenSettings={() => onSelectTab('settings')}
        onFilterOverdue={() => onSelectTab('dates')}
        onFilterTrials={() => onSelectTab('services')}
      />

      {/* 6-Month Monthly Spend Trend Chart (Recharts) */}
      <MonthlySpendTrendChart onSelectTab={onSelectTab} />

      {/* Renewal Spotlight Widget (Expiring in Next 30 Days) */}
      <RenewalSpotlightWidget
        onEditService={(s) => {
          if (onEditService) onEditService(s);
          else onOpenServiceModal();
        }}
        onSelectProduct={onSelectProduct}
        onSelectTab={onSelectTab}
        onQuickAddService={onOpenServiceModal}
      />

      {/* 12-Month Renewal Cashflow Forecast Widget */}
      <CashflowForecastWidget />

      {/* Due Soon & Renewals Timeline */}
      <DueSoonSection
        onSnoozeItem={(id, days) => snoozeImportantDate(id, days)}
        onMarkDone={(id) => markDateDone(id)}
        onSelectProduct={(pId) => onSelectProduct(pId)}
        onOpenDateModal={() => onSelectTab('dates')}
      />

      {/* Provider Concentration & Single Point of Failure */}
      <ProviderConcentration onSelectProvider={() => onSelectTab('services')} />

      {/* Spend Breakdowns (Per Product & Per Category) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Product Cost Distribution */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span>Monthly Burn by SaaS Product</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Per-product operational expense breakdown
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
                No products yet. Click &ldquo;Create from Template&rdquo; above to stamp your first stack.
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
    </div>
  );
};
