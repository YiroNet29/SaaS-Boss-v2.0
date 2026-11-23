/**
 * What the Dates page needs in every layout: the filters and the filtered list, what to say when nothing
 * shows, the delete confirmation, "Check now" on a domain / SSL date, and the calendar export.
 */
import { useMemo, useState } from 'react';
import type { ImportantDate, Product, ServiceLink } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useSensitiveAction } from '../../context/LockContext';
import { describeCheck } from '../../utils/expiryChecks';
import { filterDates, type DateFilters } from '../../utils/datePages';
import { generateICS, downloadICS } from '../../utils/ics';

/** The empty state's words and buttons. */
export interface DatesEmpty {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export function useDatesList(onAddDate: () => void) {
  const { dates, products, services, deleteImportantDate, markDateDone, todayStr } = useWorkspace();
  const sensitive = useSensitiveAction();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [dateToDelete, setDateToDelete] = useState<ImportantDate | null>(null);

  const prodMap = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);

  const filters: DateFilters = { search, status: statusFilter, type: typeFilter, productId: productFilter };
  const filteredDates = filterDates(dates, prodMap, filters);
  // Nothing shows only because every date is done (the default view hides done ones).
  const onlyDoneHidden =
    !search && statusFilter === 'open' && typeFilter === 'all' && productFilter === 'all' && dates.length > 0;

  /** The app a date belongs to, as the list names it. */
  const appName = (d: ImportantDate) => (d.productId ? prodMap.get(d.productId) || 'Global' : 'Global');

  const clearFilters = () => {
    setSearch('');
    // Clearing back to "open" would change nothing when only done dates are left.
    setStatusFilter(onlyDoneHidden ? 'all' : 'open');
    setTypeFilter('all');
    setProductFilter('all');
  };

  const empty: DatesEmpty | null = filteredDates.length
    ? null
    : dates.length
      ? {
          title: 'No dates match',
          description: onlyDoneHidden
            ? 'Every date is done. Done dates are hidden; show them with "All Dates".'
            : statusFilter === 'open'
              ? 'Nothing open matches this search and these filters. Done ones show under "All Dates".'
              : 'Nothing matches this search and these filters.',
          actionLabel: onlyDoneHidden ? 'Show all dates' : 'Clear filters',
          onAction: clearFilters,
          secondaryActionLabel: 'Add a date',
          onSecondaryAction: onAddDate,
        }
      : {
          title: 'No dates yet',
          description:
            'Add the dates that matter: domain and SSL expiry, key rotations, tax filing, contract ends. Reminders come on your usual days before each one. Service renewals are reminded on their own.',
          actionLabel: 'Add a date',
          onAction: onAddDate,
        };

  const cancelDelete = () => setDateToDelete(null);
  const confirmDelete = async () => {
    if (!dateToDelete) return;
    if (!(await sensitive(`delete "${dateToDelete.title}"`))) return setDateToDelete(null);
    deleteImportantDate(dateToDelete.id);
    setDateToDelete(null);
  };

  return {
    dates,
    products,
    services,
    prodMap,
    appName,
    todayStr,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    productFilter,
    setProductFilter,
    filters,
    filteredDates,
    empty,
    markDateDone,
    dateToDelete,
    askDelete: setDateToDelete,
    cancelDelete,
    confirmDelete,
  };
}

export type DatesList = ReturnType<typeof useDatesList>;

/** "Check now" on a domain / SSL date, and how its last check reads. */
export function useCheckNow(item: ImportantDate) {
  const { checkDateNow, isDemoMode } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const c = item.lastCheck;
  const tone: 'warn' | 'none' | 'ok' = c?.status === 'error' || c?.problem ? 'warn' : c?.status === 'manual' ? 'none' : 'ok';
  const run = async () => {
    setBusy(true);
    setMsg(null);
    const r = await checkDateNow(item.id);
    setBusy(false);
    setMsg(r.ok ? (r.notes?.length ? r.notes.join(' ') : 'Checked: no change.') : r.error ?? 'Check failed.');
  };
  return {
    busy,
    msg,
    run,
    tone,
    text: item.autoCheck ? describeCheck(c) : 'automatic check off',
    /** Example data can't be checked. */
    canCheck: !isDemoMode,
  };
}

/** Downloads the dates and renewals as a calendar file (.ics), after "Confirm it's you" when the lock is on. */
export function useIcsExport(dates: ImportantDate[], services: ServiceLink[], products: Product[]) {
  const { currentWorkspace } = useWorkspace();
  const sensitive = useSensitiveAction();
  return async () => {
    if (!(await sensitive('export your calendar', { exportOf: 'Calendar (.ics)' }))) return;
    const ics = generateICS(dates, services, products, currentWorkspace.name);
    downloadICS(ics, `stacktrack-${currentWorkspace.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.ics`);
  };
}
