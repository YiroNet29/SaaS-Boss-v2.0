import React, { useState } from 'react';
import {
  Link2,
  Plus,
  Search,
  Filter,
  Copy,
  Edit2,
  Trash2,
  ExternalLink,
  Calendar,
  KeyRound,
  CheckSquare,
  Square,
  Edit3,
  Download,
} from 'lucide-react';
import { ServiceLink, ServiceCategory, EnvironmentType, ServiceStatus } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { StatusBadge } from '../common/StatusBadge';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportServicesToCSV, downloadFile } from '../../utils/csv';
import { EmptyState } from '../common/EmptyState';
import { ConfirmDialog } from '../common/ConfirmDialog';

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
  const { services, products, currentWorkspace, deleteServiceLink, knownProviders } = useWorkspace();

  const [search, setSearch] = useState(initialSearch);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [envFilter, setEnvFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Sync search if initialSearch changes
  React.useEffect(() => {
    if (initialSearch) {
      setSearch(initialSearch);
    }
  }, [initialSearch]);

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [serviceToDelete, setServiceToDelete] = useState<ServiceLink | null>(null);

  const prodMap = new Map<string, string>();
  for (const p of products) {
    prodMap.set(p.id, p.name);
  }

  // Filter logic
  const filteredServices = services.filter((s) => {
    const pName = prodMap.get(s.productId) || '';
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      s.providerName.toLowerCase().includes(q) ||
      pName.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      (s.loginUrl && s.loginUrl.toLowerCase().includes(q)) ||
      (s.notes && s.notes.toLowerCase().includes(q));

    const matchesCat = categoryFilter === 'all' || s.category === categoryFilter;
    const matchesProv = providerFilter === 'all' || s.providerName === providerFilter;
    const matchesEnv = envFilter === 'all' || s.environmentType === envFilter;
    const matchesStat = statusFilter === 'all' || s.status === statusFilter;

    return matchesSearch && matchesCat && matchesProv && matchesEnv && matchesStat;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredServices.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredServices.map((s) => s.id));
    }
  };

  const handleExportCSV = () => {
    const targetServices = selectedIds.length > 0
      ? services.filter((s) => selectedIds.includes(s.id))
      : filteredServices;
    const rate = currentWorkspace.exchangeRates.ETB_per_USD || 130;
    const csv = exportServicesToCSV(products, targetServices, rate);
    const filename = `stacktrack-${currentWorkspace.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-services.csv`;
    downloadFile(csv, filename, 'text/csv');
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
            <span>Service Links & Subscriptions</span>
            <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
              {services.length}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Hosting, databases, APIs, email delivery, and third-party vendors across all apps.
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
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 capitalize"
            >
              <option value="all">All Categories</option>
              {[
                'hosting',
                'domain registrar',
                'database',
                'email provider',
                'payment processor',
                'auth',
                'analytics',
                'error monitoring',
                'Google API',
                'Telegram API',
                'storage',
                'SMS',
              ].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Provider Filter */}
            <select
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
              value={envFilter}
              onChange={(e) => setEnvFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 capitalize"
            >
              <option value="all">All Envs</option>
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="dev">Dev</option>
            </select>

            {/* Status Filter */}
            <select
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
        <EmptyState
          icon={Link2}
          title="No services match criteria"
          description="Try relaxing your category or environment filters, or add a new service link."
          actionLabel="Add Service"
          onAction={onAddService}
        />
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
                        <span>Plan: {service.plan || 'Standard'}</span>
                        <span>•</span>
                        <span>Billing: {service.billingCycle}</span>
                        {service.paymentMethodLabel && (
                          <>
                            <span>•</span>
                            <span>{service.paymentMethodLabel}</span>
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

                      {service.notes && (
                        <p className="text-xs text-slate-400 italic pt-0.5">
                          "{service.notes}"
                        </p>
                      )}

                      {/* Attached Vault references */}
                      {service.vaultRefs?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {service.vaultRefs.map((v) => (
                            <a
                              key={v.vaultItemId}
                              href={`${currentWorkspace.vaultBaseUrl}/vault/api-keys/${v.vaultItemId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20"
                            >
                              <KeyRound className="w-2.5 h-2.5" />
                              <span>{v.label}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
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
                          title="Open console login URL"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
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
                        title="Delete service link"
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
      {serviceToDelete && (
        <ConfirmDialog
          isOpen={!!serviceToDelete}
          title={`Delete "${serviceToDelete.providerName}"?`}
          message="This will remove this service link and its associated vault references."
          isDestructive
          confirmLabel="Delete Service"
          onConfirm={() => {
            deleteServiceLink(serviceToDelete.id);
            setServiceToDelete(null);
          }}
          onCancel={() => setServiceToDelete(null)}
        />
      )}
    </div>
  );
};
