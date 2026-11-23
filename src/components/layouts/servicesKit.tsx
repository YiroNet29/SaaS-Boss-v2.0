/**
 * Pieces the Timeline and Portfolio Services pages share: the filter bar and its buttons, Select all,
 * a row's checkbox and actions, and what shows under a row (price change, notes, vault keys, "Paid ✓").
 * State and handlers come from useServiceList, the same hook the Classic page uses.
 */
import React, { useMemo } from 'react';
import { CheckSquare, Copy, Download, Edit2, Edit3, ExternalLink, Plus, Square, Trash2 } from 'lucide-react';
import type { ServiceLink } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { SERVICE_CATEGORIES, type ServiceList } from '../services/useServiceList';
import { VaultRefChip } from '../vault/VaultRefChip';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { categoryLabel } from '../../utils/portfolio';
import { summarizeUpcoming } from '../../utils/summary';
import { FALLBACK_ETB_PER_USD } from '../../utils/fx';
import { canMarkPaid } from '../../utils/serviceViews';
import { PILL, SearchBox, SelectChip, Stat, Toolbar, btnPrimary, btnSecondary } from './kit';

export const usd = (n: number) => formatCurrency(Math.round(n * 100) / 100, 'USD');
export const etb = (n: number) => formatCurrency(Math.round(n), 'ETB');
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Today, the exchange rate, and the two numbers both page heads show. */
export function useServiceTotals() {
  const { services, totalCosts, currentWorkspace } = useWorkspace();
  const rate = currentWorkspace.exchangeRates?.ETB_per_USD || FALLBACK_ETB_PER_USD;
  const today = new Date().toLocaleDateString('en-CA');
  const next30 = useMemo(() => summarizeUpcoming(services, [], rate, today).renewals, [services, rate, today]);
  return { rate, today, totalCosts, next30 };
}

/** "Monthly" and "Next 30 days" tiles for the page head. */
export const MoneyStats: React.FC<{ totals: ReturnType<typeof useServiceTotals> }> = ({ totals }) => (
  <>
    <Stat label="Monthly" value={usd(totals.totalCosts.totalUsd)} sub={etb(totals.totalCosts.totalEtb)} className="col-span-2" />
    <Stat label="Next 30 days" value={plural(totals.next30.count, 'renewal')} sub={usd(totals.next30.totalUsd)} />
  </>
);

const ENVIRONMENTS = [
  { value: 'all', label: 'All environments' },
  { value: 'production', label: 'Production' },
  { value: 'staging', label: 'Staging' },
  { value: 'dev', label: 'Dev' },
];
const STATUSES = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'trial', label: 'Trial' },
  { value: 'paused', label: 'Paused' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** Search, the filters, and Bulk Edit / Export CSV / Add Service. `lead` goes first (a view switch). */
export const ServiceToolbar: React.FC<{
  list: ServiceList;
  onAddService: () => void;
  onOpenBulkEdit: (ids: string[]) => void;
  /** Show the "All apps" filter. */
  appFilter?: boolean;
  lead?: React.ReactNode;
}> = ({ list, onAddService, onOpenBulkEdit, appFilter, lead }) => (
  <Toolbar
    left={
      <>
        {lead}
        <SearchBox value={list.search} onChange={list.setSearch} placeholder="Search provider, app, category, notes…" label="Search services" />
        {appFilter && (
          <SelectChip
            label="Filter by app"
            value={list.appFilter}
            onChange={list.setAppFilter}
            options={[{ value: 'all', label: 'All apps' }, ...list.products.map((p) => ({ value: p.id, label: p.name }))]}
          />
        )}
        <SelectChip
          label="Filter by category"
          value={list.categoryFilter}
          onChange={list.setCategoryFilter}
          options={[{ value: 'all', label: 'All categories' }, ...SERVICE_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))]}
        />
        <SelectChip
          label="Filter by provider"
          value={list.providerFilter}
          onChange={list.setProviderFilter}
          options={[{ value: 'all', label: 'All providers' }, ...list.knownProviders.map((p) => ({ value: p, label: p }))]}
        />
        <SelectChip label="Filter by environment" value={list.envFilter} onChange={list.setEnvFilter} options={ENVIRONMENTS} />
        <SelectChip label="Filter by status" value={list.statusFilter} onChange={list.setStatusFilter} options={STATUSES} />
      </>
    }
    right={
      <>
        {list.selectedIds.length > 0 && (
          <button
            type="button"
            onClick={() => onOpenBulkEdit(list.selectedIds)}
            className={`inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-full text-sm font-semibold whitespace-nowrap ${PILL.warn}`}
          >
            <Edit3 className="w-4 h-4" aria-hidden="true" />
            Bulk Edit ({list.selectedIds.length})
          </button>
        )}
        <button
          type="button"
          onClick={list.handleExportCSV}
          className={btnSecondary}
          title={list.selectedIds.length > 0 ? `Export ${list.selectedIds.length} selected services to CSV` : 'Export services to CSV'}
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          Export CSV
        </button>
        <button type="button" onClick={onAddService} className={btnPrimary}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add Service
        </button>
      </>
    }
  />
);

/** "Select All (N)" / "Deselect All", and how many are picked for Bulk Edit or Export. */
export const SelectionBar: React.FC<{ list: ServiceList }> = ({ list }) =>
  list.filteredServices.length > 0 ? (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-slate-400">
      <button type="button" onClick={list.toggleSelectAll} className="inline-flex items-center gap-2 min-h-[32px] font-medium hover:text-slate-200">
        {list.allSelected ? <CheckSquare className="w-4 h-4 text-indigo-400" aria-hidden="true" /> : <Square className="w-4 h-4" aria-hidden="true" />}
        <span>{list.allSelected ? 'Deselect All' : `Select All (${list.filteredServices.length})`}</span>
      </button>
      <span>{list.selectedIds.length} items selected for bulk actions</span>
    </div>
  ) : null;

/** A row's checkbox for Bulk Edit and Export. */
export const ServiceCheck: React.FC<{ list: ServiceList; service: ServiceLink; label: string }> = ({ list, service, label }) => (
  <input
    type="checkbox"
    checked={list.selectedIds.includes(service.id)}
    onChange={() => list.toggleSelect(service.id)}
    aria-label={`Select ${label}`}
    className="mt-1 w-4 h-4 shrink-0 rounded accent-indigo-500 cursor-pointer"
  />
);

const iconBtn =
  'inline-flex items-center justify-center w-8 h-8 shrink-0 rounded-full border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-slate-100 transition-colors';

/** Mark paid (renewals paid by hand), open the login page, duplicate, edit, delete. */
export const RowActions: React.FC<{
  list: ServiceList;
  service: ServiceLink;
  onEdit: (s: ServiceLink) => void;
  onDuplicate: (s: ServiceLink) => void;
  className?: string;
}> = ({ list, service: s, onEdit, onDuplicate, className = '' }) => (
  <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
    {canMarkPaid(s) && (
      <button
        type="button"
        onClick={() => list.markPaid(s)}
        className={`inline-flex items-center min-h-[32px] px-3 rounded-full text-xs font-semibold whitespace-nowrap ${PILL.ok}`}
        title="Record this renewal as paid and move to the next date"
      >
        Mark paid
      </button>
    )}
    {s.loginUrl && (
      <a href={s.loginUrl} target="_blank" rel="noopener noreferrer" className={iconBtn} title="Open its login page" aria-label={`Open ${s.providerName}'s login page`}>
        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
      </a>
    )}
    <button type="button" onClick={() => onDuplicate(s)} className={iconBtn} title="Duplicate across multiple products" aria-label={`Duplicate ${s.providerName} to other apps`}>
      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
    <button type="button" onClick={() => onEdit(s)} className={iconBtn} title="Edit service details" aria-label={`Edit ${s.providerName}`}>
      <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
    <button type="button" onClick={() => list.setServiceToDelete(s)} className={iconBtn} title="Delete service" aria-label={`Delete ${s.providerName}`}>
      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
  </div>
);

/** Under a row: "Paid ✓ next …", a changed price with "Use $X", the notes and vault keys. Nothing when there's none. */
export const RowExtras: React.FC<{ list: ServiceList; service: ServiceLink }> = ({ list, service: s }) => {
  const c = list.changed.get(s.id);
  const paid = list.paidNote?.id === s.id ? list.paidNote : null;
  if (!c && !paid && !s.notes && !s.vaultRefs?.length) return null;
  return (
    <div className="space-y-1.5">
      {paid && <p className={`text-xs font-semibold ${paid.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{paid.text}</p>}
      {c && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-400" role="note">
          <span>
            Last charge {formatCurrency(c.charged, s.currency)} on {formatDate(c.paidOn)}, listed {formatCurrency(s.cost, s.currency)}.
          </span>
          <button
            type="button"
            onClick={() => list.applyChargedPrice(s)}
            className={`inline-flex items-center min-h-[28px] px-2.5 rounded-full font-semibold whitespace-nowrap ${PILL.warn}`}
          >
            Use {formatCurrency(c.charged, s.currency)}
          </button>
        </div>
      )}
      {s.notes && <p className="text-xs text-slate-400 italic break-words">&ldquo;{s.notes}&rdquo;</p>}
      {s.vaultRefs?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {s.vaultRefs.map((v) => (
            <VaultRefChip key={v.vaultItemId} label={v.label} itemId={v.vaultItemId} />
          ))}
        </div>
      )}
    </div>
  );
};

/** Says "Paid ✓ next …" to screen readers (the row may move to another group when its date changes). */
export const PaidAnnouncer: React.FC<{ list: ServiceList }> = ({ list }) => {
  const name = list.paidNote ? list.services.find((s) => s.id === list.paidNote!.id)?.providerName : undefined;
  return (
    <p role="status" className="sr-only">
      {list.paidNote ? `${name ? `${name}: ` : ''}${list.paidNote.text}` : ''}
    </p>
  );
};
