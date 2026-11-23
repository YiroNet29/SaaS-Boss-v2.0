import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { ImportantDate } from '../../../types';
import { CalendarView } from '../../dates/CalendarView';
import { DeleteDateDialog } from '../../dates/DeleteDateDialog';
import { useDatesList, useIcsExport, type DatesList } from '../../dates/useDatesList';
import {
  DateActions,
  DateExtras,
  DateFacts,
  DateTags,
  DatesEmptyCard,
  DatesToolbar,
  type DatesPageProps,
} from '../../dates/LayoutDateParts';
import { useWorkspace } from '../../../context/WorkspaceContext';
import { FALLBACK_ETB_PER_USD } from '../../../utils/fx';
import { getDaysDiff } from '../../../utils/reminders';
import { monthlyCostByApp } from '../../../utils/timeline';
import {
  appStatusTone,
  columnCount,
  columnEmptyText,
  dateColumns,
  dateStats,
  dateTone,
  dayLabel,
  effectiveDay,
  plural,
  typeLabel,
  type DateColumn,
} from '../../../utils/datePages';
import { Page, PageHead, Pill, Stat } from '../kit';

type Props = DatesPageProps;

type View = 'apps' | 'calendar';
const VIEWS: { value: View; label: string }[] = [
  { value: 'apps', label: 'By app' },
  { value: 'calendar', label: 'Calendar' },
];

const DateRow: React.FC<{
  item: ImportantDate;
  today: string;
  list: DatesList;
  onEditDate: (d: ImportantDate) => void;
  onOpenSnooze: (d: ImportantDate) => void;
}> = ({ item, today, list, onEditDate, onOpenSnooze }) => {
  const day = effectiveDay(item);
  const daysDiff = getDaysDiff(today, day);
  return (
    <li className="px-5 py-3.5 border-b border-slate-800 flex flex-col gap-2">
      <div className="flex justify-between items-baseline gap-3">
        <h3 className="text-[15px] font-semibold text-slate-100 break-words min-w-0">{item.title}</h3>
        <span className="text-sm text-slate-200 tabular-nums whitespace-nowrap">{dayLabel(day, today)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <DateTags item={item} tone={dateTone(item.status, daysDiff)} />
      </div>
      {/* The day on the right is the snoozed-to day, so the due day shows only when they differ. */}
      <DateFacts item={item} daysDiff={daysDiff} showDue={!!item.snoozedUntil} />
      <DateExtras item={item} />
      <DateActions item={item} list={list} onEditDate={onEditDate} onOpenSnooze={onOpenSnooze} />
    </li>
  );
};

const Column: React.FC<{
  col: DateColumn;
  today: string;
  list: DatesList;
  onAdd: () => void;
  onEditDate: (d: ImportantDate) => void;
  onOpenSnooze: (d: ImportantDate) => void;
}> = ({ col, today, list, onAdd, onEditDate, onOpenSnooze }) => {
  const name = col.product?.name ?? 'Whole workspace';
  const headingId = `dates-col-${col.key}`;
  const count = columnCount(col);
  return (
    <section
      aria-labelledby={headingId}
      className="flex-[1_1_270px] min-w-0 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex flex-col"
    >
      <div className="px-5 py-4 border-b border-slate-800 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h2 id={headingId} className="text-xl font-bold text-slate-100 break-words min-w-0">
              {name}
            </h2>
            {col.product && <Pill tone={appStatusTone(col.product.status)}>{typeLabel(col.product.status)}</Pill>}
          </div>
          {count && <span className="text-sm text-slate-400">{count}</span>}
        </div>
        {!col.product && <p className="text-xs text-slate-400">Dates not tied to one app</p>}
      </div>
      {col.dates.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-400 border-b border-slate-800">{columnEmptyText(list.statusFilter)}</p>
      ) : (
        <ul>
          {col.dates.map((d) => (
            <DateRow key={d.id} item={d} today={today} list={list} onEditDate={onEditDate} onOpenSnooze={onOpenSnooze} />
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="mt-auto flex items-center gap-2 min-h-[48px] px-5 text-sm font-semibold text-left text-indigo-400 hover:text-indigo-300"
      >
        <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{col.product ? `Add a date to ${name}` : 'Add a date to the whole workspace'}</span>
      </button>
    </section>
  );
};

/** Portfolio layout: Dates. A column per app (overdue on top), then the dates for the whole workspace. */
export const DatesPage: React.FC<Props> = ({ onAddDate, onEditDate, onOpenSnooze, onAddDateTo }) => {
  const { currentWorkspace } = useWorkspace();
  const list = useDatesList(onAddDate);
  const exportIcs = useIcsExport(list.dates, list.services, list.products);
  const [view, setView] = useState<View>('apps');
  const today = list.todayStr;
  const rate = currentWorkspace.exchangeRates?.ETB_per_USD || FALLBACK_ETB_PER_USD;

  const stats = useMemo(() => dateStats(list.dates, list.services, today), [list.dates, list.services, today]);
  // Same app order as the Portfolio dashboard (most expensive first).
  const order = useMemo(
    () => monthlyCostByApp(list.products, list.services, rate).map((a) => a.product.id),
    [list.products, list.services, rate]
  );
  // With no search or narrowing filter, every app gets a column, so a date can be added to any of them.
  const unfiltered = !list.search && list.typeFilter === 'all' && list.productFilter === 'all';
  const columns = dateColumns(list.filteredDates, list.products, today, { order, showEmpty: unfiltered });

  return (
    <Page>
      <PageHead
        eyebrow="Dates"
        title="Dates, app by app"
        sub="Domain and SSL expiry, key rotations, invoices, trials and contracts, in a column per app."
        stats={
          <>
            <Stat label="Overdue" value={stats.overdue || 'None'} tone={stats.overdue ? 'bad' : 'ok'} />
            <Stat label="Next 30 days" value={stats.next30} />
            <Stat label="Checked automatically" value={plural(stats.autoChecked, 'domain')} className="col-span-2 sm:col-span-1" />
          </>
        }
      />

      <DatesToolbar
        list={list}
        view={view}
        onView={(v) => setView(v)}
        views={VIEWS}
        calendar={view === 'calendar'}
        onExport={exportIcs}
        onAddDate={onAddDate}
      />

      {view === 'calendar' ? (
        <CalendarView dates={list.dates} services={list.services} products={list.products} onSelectDateItem={(d) => onEditDate(d)} />
      ) : list.empty ? (
        <DatesEmptyCard empty={list.empty} />
      ) : (
        <div className="flex flex-wrap gap-4 items-start">
          {columns.map((col) => (
            <Column
              key={col.key}
              col={col}
              today={today}
              list={list}
              onAdd={() => (col.product && onAddDateTo ? onAddDateTo(col.product.id) : onAddDate())}
              onEditDate={onEditDate}
              onOpenSnooze={onOpenSnooze}
            />
          ))}
        </div>
      )}

      <DeleteDateDialog list={list} />
    </Page>
  );
};
