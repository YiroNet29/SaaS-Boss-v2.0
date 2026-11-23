import { useState } from 'react';
import { Product } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { FALLBACK_ETB_PER_USD } from '../../utils/fx';
import { matchesApp } from '../../utils/appPages';

/** The Apps list's search, status filter, and the app waiting for its delete confirmation (every layout uses it). */
export function useAppList() {
  const { products, services, dates, currentWorkspace } = useWorkspace();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  const rate = currentWorkspace.exchangeRates.ETB_per_USD || FALLBACK_ETB_PER_USD;
  const filteredProducts = products.filter((p) => matchesApp(p, search, statusFilter));
  /** True while a search or status filter is on (the empty state says "No apps found"). */
  const filtering = !!search || statusFilter !== 'all';

  return {
    products,
    services,
    dates,
    rate,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    filteredProducts,
    filtering,
    productToDelete,
    setProductToDelete,
  };
}
