import React, { useMemo, useState } from 'react';
import type { ServiceLink } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useSensitiveAction } from '../../context/LockContext';
import { priceChanges } from '../../utils/priceChanges';
import { exportServicesToCSV, downloadFile } from '../../utils/csv';
import { FALLBACK_ETB_PER_USD } from '../../utils/fx';

/** The categories the Services filter offers. */
export const SERVICE_CATEGORIES = [
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
] as const;

/**
 * Everything the Services page needs, in every layout: search and filters, row selection, CSV export,
 * Mark paid, the price-change fix and delete (with "Confirm it's you").
 */
export function useServiceList(initialSearch = '') {
  const { services, products, currentWorkspace, deleteServiceLink, knownProviders, paymentSources, markServicePaid, payments, updateServiceLink } =
    useWorkspace();
  // Services whose last charge differs from the listed price (the provider changed it, or the plan did).
  const changed = useMemo(() => priceChanges(services, payments), [services, payments]);
  const [paidNote, setPaidNote] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const sourceLabel = (s: ServiceLink) => paymentSources.find((x) => x.id === s.paymentSourceId)?.name || s.paymentMethodLabel;
  const sensitive = useSensitiveAction();

  const [search, setSearch] = useState(initialSearch);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [envFilter, setEnvFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  // Only the Timeline layout shows this one; elsewhere it stays 'all'.
  const [appFilter, setAppFilter] = useState<string>('all');

  // Sync search if initialSearch changes
  React.useEffect(() => {
    if (initialSearch) {
      setSearch(initialSearch);
    }
  }, [initialSearch]);

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [serviceToDelete, setServiceToDelete] = useState<ServiceLink | null>(null);

  const prodMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) m.set(p.id, p.name);
    return m;
  }, [products]);

  // Filter logic
  const filteredServices = useMemo(
    () =>
      services.filter((s) => {
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
        const matchesApp = appFilter === 'all' || s.productId === appFilter;

        return matchesSearch && matchesCat && matchesProv && matchesEnv && matchesStat && matchesApp;
      }),
    [services, prodMap, search, categoryFilter, providerFilter, envFilter, statusFilter, appFilter]
  );

  const filtersOn =
    !!search || categoryFilter !== 'all' || providerFilter !== 'all' || envFilter !== 'all' || statusFilter !== 'all' || appFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setProviderFilter('all');
    setEnvFilter('all');
    setStatusFilter('all');
    setAppFilter('all');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const allSelected = selectedIds.length === filteredServices.length;
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredServices.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredServices.map((s) => s.id));
    }
  };

  const handleExportCSV = async () => {
    if (!(await sensitive('export your services', { exportOf: 'Services CSV' }))) return;
    const targetServices = selectedIds.length > 0 ? services.filter((s) => selectedIds.includes(s.id)) : filteredServices;
    const rate = currentWorkspace.exchangeRates.ETB_per_USD || FALLBACK_ETB_PER_USD;
    const csv = exportServicesToCSV(products, targetServices, rate);
    const filename = `stacktrack-${currentWorkspace.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-services.csv`;
    downloadFile(csv, filename, 'text/csv');
  };

  /** Records this renewal as paid and moves it to the next date; the result shows next to the row. */
  const markPaid = (service: ServiceLink) => {
    const r = markServicePaid(service.id);
    setPaidNote({ id: service.id, text: r.ok ? `Paid ✓ next ${r.next}` : r.error ?? 'Could not mark paid', ok: r.ok });
  };

  /** Takes the last charge as the new listed price. */
  const applyChargedPrice = (service: ServiceLink) => {
    const c = changed.get(service.id);
    if (c) updateServiceLink(service.id, { cost: c.charged });
  };

  const confirmDelete = async () => {
    if (!serviceToDelete) return;
    if (!(await sensitive(`delete "${serviceToDelete.providerName}"`))) return setServiceToDelete(null);
    deleteServiceLink(serviceToDelete.id);
    setServiceToDelete(null);
  };

  return {
    services,
    products,
    knownProviders,
    prodMap,
    changed,
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
    appFilter,
    setAppFilter,
    filteredServices,
    filtersOn,
    clearFilters,
    selectedIds,
    toggleSelect,
    allSelected,
    toggleSelectAll,
    handleExportCSV,
    paidNote,
    markPaid,
    applyChargedPrice,
    serviceToDelete,
    setServiceToDelete,
    confirmDelete,
  };
}

export type ServiceList = ReturnType<typeof useServiceList>;
