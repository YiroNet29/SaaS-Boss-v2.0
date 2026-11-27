import { useEffect, useMemo, useState } from 'react';
import { Product } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { FALLBACK_ETB_PER_USD } from '../../utils/fx';
import { matchesApp, matchesTag, statusCounts, tagOptions } from '../../utils/appPages';

/** The Apps list's search, status and tag filters, and the app waiting for its delete confirmation (every layout uses it). */
export function useAppList() {
  const { products, services, dates, currentWorkspace } = useWorkspace();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [chosenTag, setTagFilter] = useState<string>('all');
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  const rate = currentWorkspace.exchangeRates.ETB_per_USD || FALLBACK_ETB_PER_USD;
  /** The tag filter's choices; empty (filter hidden) when no app has a tag. */
  const tags = useMemo(() => tagOptions(products), [products]);
  // A tag nobody uses any more (its last app was deleted or renamed) falls back to every app.
  const tagFilter = tags.some((t) => t.value === chosenTag) ? chosenTag : 'all';
  // ...and forgets it, so it doesn't quietly come back when an app gets that tag again.
  useEffect(() => {
    if (tagFilter !== chosenTag) setTagFilter('all');
  }, [tagFilter, chosenTag]);
  const inTag = products.filter((p) => matchesTag(p, tagFilter));
  const filteredProducts = inTag.filter((p) => matchesApp(p, search, statusFilter));
  /** The status chips' counts, within the chosen tag. */
  const counts = statusCounts(inTag);
  /** True while a search or filter is on (the empty state says "No apps found"). */
  const filtering = !!search || statusFilter !== 'all' || tagFilter !== 'all';

  return {
    products,
    services,
    dates,
    rate,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    tagFilter,
    setTagFilter,
    tags,
    counts,
    filteredProducts,
    filtering,
    productToDelete,
    setProductToDelete,
  };
}

/** What the empty Apps list says while a search or filter hides every app. */
export const NO_MATCH_TEXT = 'Try another search, or set the filters back to All.';
