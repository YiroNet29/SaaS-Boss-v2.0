import React from 'react';
import {
  Plus,
  Search,
  Copy,
  Edit2,
  Trash2,
  ExternalLink,
  Calendar,
  CheckSquare,
  Square,
  Edit3,
  Download,
} from 'lucide-react';
import { ServiceLink } from '../../types';
import { VaultRefChip } from '../vault/VaultRefChip';
import { StatusBadge } from '../common/StatusBadge';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { canMarkPaid } from '../../utils/serviceViews';
import { useServiceList, SERVICE_CATEGORIES } from './useServiceList';
import { ServiceEmptyState, DeleteServiceDialog } from './ServiceListParts';

interface ServiceListViewProps {
  onAddService: () => void;
  onEditService: (s: ServiceLink) => void;
  onDuplicateService: (s: ServiceLink) => void;
  onOpenBulkEdit: (selectedIds: string[]) => void;
  initialSearch?: string;
}

export const ServiceListView: React.FC<ServiceListViewProps> = ({
  onAddService,
  onEditService,
  onDuplicateService,
  onOpenBulkEdit,
  initialSearch = '',
}) => {
  const list = useServiceList(initialSearch);
  const {
    services,
    knownProviders,
    prodMap,
    changed,
    paidNote,
    sourceLabel,
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    providerFilter,
    setProviderFilter,
    envFilter,
    setEnvFilter,
    statusFilter,
    setStatusFilter,
    selectedIds,
    filteredServices,
    toggleSelect,
    toggleSelectAll,
    handleExportCSV,
    markPaid,
    applyChargedPrice,
    setServiceToDelete,
  } = list;

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
            <span>Services & Subscriptions</span>
            <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
              {services.length}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Everything your apps pay for: hosting, domains, databases, email, APIs. Costs and renewal dates live here.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.length > 0 && (
            <button
              onClick={() => onOpenBulkEdit(selectedIds)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Bulk Edit ({selectedIds.length})</span>
            </button>
          )}

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 text-xs font-medium transition-colors"
            title={selectedIds.length > 0 ? `Export ${selectedIds.length} selected services to CSV` : 'Export services to CSV'}
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={onAddService}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Service</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search provider, product, category, notes..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Category Dropdown */}
            <select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 capitalize"
            >
              <option value="all">All Categories</option>
              {SERVICE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Provider Filter */}
            <select
              aria-label="Filter by provider"
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200"
            >
              <option value="all">All Providers</option>
              {knownProviders.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            {/* Environment Filter */}
            <select
              aria-label="Filter by environment"
              value={envFilter}
              onChange={(e) => setEnvFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 capitalize"
            >
              <option value="all">All environments</option>
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="dev">Dev</option>
            </select>

            {/* Status Filter */}
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 capitalize"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="paused">Paused</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Selection bar */}
        {filteredServices.length > 0 && (
          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 hover:text-slate-200 font-medium"
            >
              {selectedIds.length === filteredServices.length ? (
                <CheckSquare className="w-4 h-4 text-indigo-400" />
              ) : (
                <Square className="w-4 h-4 text-slate-500" />
              )}
              <span>
                {selectedIds.length === filteredServices.length
                  ? 'Deselect All'
                  : `Select All (${filteredServices.length})`}
              </span>
            </button>
            <span>{selectedIds.length} items selected for bulk actions</span>
          </div>
        )}
      </div>

      {/* Services List / Table */}
      {!filteredServices.length ? (
        <ServiceEmptyState list={list} onAddService={onAddService} />
      ) : (
        <div className="space-y-3">
          {filteredServices.map((service) => {
            const isSelected = selectedIds.includes(service.id);
            const productName = prodMap.get(service.productId) || 'Unknown Product';

            return (
              <div
                key={service.id}
                className={`p-4 rounded-2xl bg-slate-900 border transition-all ${
                  isSelected ? 'border-indigo-500/80 bg-indigo-950/20' : 'border-slate-800 hover:border-slate-750'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleSelect(service.id)}
                      className="mt-1 p-0.5 text-slate-400 hover:text-slate-200"
                      aria-label="Select service"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-600" />
                      )}
                    </button>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-100">
                          {service.providerName}
                        </span>
                        <span className="text-[11px] font-semibold text-indigo-300 px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20">
                          {productName}
                        </span>
                        <span className="text-[10px] uppercase font-bold text-slate-400 px-1.5 py-0.2 rounded bg-slate-800">
                          {service.environmentType}
                        </span>
                        <span className="text-[10px] text-slate-400 capitalize">
                          ({service.category})
                        </span>
                        <StatusBadge status={service.status} size="sm" />
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        {service.plan && (
                          <>
                            <span>Plan: {service.plan}</span>
                            <span>•</span>
                          </>
                        )}
                        <span>Billing: {service.billingCycle}</span>
                        {sourceLabel(service) && (
                          <>
                            <span>•</span>
                            <span>Paid with {sourceLabel(service)}</span>
                          </>
                        )}
                        {service.renewalDate && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1 text-slate-300">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              Renews: {formatDate(service.renewalDate)}
                            </span>
                          </>
                        )}
                      </div>

                      {changed.get(service.id) && (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-amber-300" role="note">
                          <span>
                            Last charge {formatCurrency(changed.get(service.id)!.charged, service.currency)} on {formatDate(changed.get(service.id)!.paidOn)}, listed{' '}
                            {formatCurrency(service.cost, service.currency)}.
                          </span>
                          <button
                            type="button"
                            onClick={() => applyChargedPrice(service)}
                            className="px-2 py-0.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 font-semibold"
                          >
                            Use {formatCurrency(changed.get(service.id)!.charged, service.currency)}
                          </button>
                        </div>
                      )}

                      {service.notes && (
                        <p className="text-xs text-slate-400 italic pt-0.5">
                          "{service.notes}"
                        </p>
                      )}

                      {/* Attached Vault references */}
                      {service.vaultRefs?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {service.vaultRefs.map((v) => (
                            <VaultRefChip key={v.vaultItemId} label={v.label} itemId={v.vaultItemId} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right side cost & actions */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 border-t sm:border-t-0 border-slate-800 pt-2 sm:pt-0">
                    <div className="text-left sm:text-right">
                      <div className="font-mono text-base font-bold text-slate-100">
                        {formatCurrency(service.cost, service.currency)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {service.autoRenew ? 'Auto-renew enabled' : 'Manual renewal'}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {service.loginUrl && (
                        <a
                          href={service.loginUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white"
                          title="Open its login page"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {canMarkPaid(service) && (
                        <button
                          onClick={() => markPaid(service)}
                          className="px-2 py-1 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold"
                          title="Record this renewal as paid and move to the next date"
                        >
                          Mark paid
                        </button>
                      )}
                      {paidNote?.id === service.id && <span className="text-[11px] text-emerald-300" role="status">{paidNote.text}</span>}
                      <button
                        onClick={() => onDuplicateService(service)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-indigo-300"
                        title="Duplicate across multiple products"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onEditService(service)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white"
                        title="Edit service details"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setServiceToDelete(service)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                        title="Delete service"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation */}
      <DeleteServiceDialog list={list} />
    </div>
  );
};
