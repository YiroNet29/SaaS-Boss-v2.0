/**
 * Pieces of the Dates page shared by the Timeline and Portfolio layouts: the toolbar, a date's pills,
 * facts, domain / SSL check and actions, and the empty state. Built from the layouts' kit.
 */
import React from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Download,
  Edit2,
  Globe,
  Loader2,
  Plus,
  RotateCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { ImportantDate, ServiceLink } from '../../types';
import type { DatesListView } from './DatesListView';
import { formatDaysDiff } from '../../utils/formatters';
import { isCheckable } from '../../utils/expiryChecks';
import { DATE_TYPES, dueText, recurrenceText, typeLabel, type DateTone } from '../../utils/datePages';
import { Pill, SearchBox, Segmented, SelectChip, Toolbar, btnPrimary, btnSecondary, btnSmall, type PillTone } from '../layouts/kit';
import { useCheckNow, type DatesEmpty, type DatesList } from './useDatesList';

/**
 * Props of the Timeline and Portfolio Dates pages: the Classic page's, plus two optional ones (both pages
 * accept both, so the shell can pass them to either layout).
 */
export type DatesPageProps = React.ComponentProps<typeof DatesListView> & {
  /** Timeline: opens a service's form from its renewal. Without it, renewals show with no button. */
  onEditService?: (s: ServiceLink) => void;
  /** Portfolio: opens the date form with this app picked. Without it, "Add a date to <app>" opens the usual form. */
  onAddDateTo?: (productId: string) => void;
};

const STATUS_OPTIONS = [
  { value: 'open', label: 'Active & Snoozed' },
  { value: 'all', label: 'All Dates' },
  { value: 'done', label: 'Completed' },
];
const TYPE_OPTIONS = [{ value: 'all', label: 'All Types' }, ...DATE_TYPES.map((t) => ({ value: t as string, label: typeLabel(t) }))];

const STATUS_PILL: Record<ImportantDate['status'], [PillTone, string]> = {
  open: ['free', 'Open'],
  snoozed: ['date', 'Snoozed'],
  done: ['ok', 'Done'],
};

/** A round icon-only button for rows (needs aria-label and title). */
const iconBtn =
  'inline-flex items-center justify-center min-h-[32px] w-8 shrink-0 rounded-full border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-slate-100 transition-colors';

/** View switch, search and filters on the left; Export .ics and Add Date on the right. */
export function DatesToolbar<V extends string>({
  list,
  view,
  onView,
  views,
  calendar,
  extra,
  onExport,
  onAddDate,
}: {
  list: DatesList;
  view: V;
  onView: (v: V) => void;
  views: { value: V; label: string }[];
  /** The calendar is showing: it has its own export and shows every date, so the filters are hidden. */
  calendar: boolean;
  /** More chips after the filters. */
  extra?: React.ReactNode;
  onExport: () => void;
  onAddDate: () => void;
}) {
  const appOptions = [{ value: 'all', label: 'All apps' }, ...list.products.map((p) => ({ value: p.id, label: p.name }))];
  return (
    <Toolbar
      left={
        <>
          <Segmented label="View" value={view} onChange={onView} options={views} />
          {!calendar && (
            <>
              <SearchBox value={list.search} onChange={list.setSearch} placeholder="Search title, app, notes…" label="Search dates" />
              <SelectChip label="Filter by status" value={list.statusFilter} onChange={list.setStatusFilter} options={STATUS_OPTIONS} />
              <SelectChip label="Filter by type" value={list.typeFilter} onChange={list.setTypeFilter} options={TYPE_OPTIONS} />
              <SelectChip label="Filter by app" value={list.productFilter} onChange={list.setProductFilter} options={appOptions} />
              {extra}
            </>
          )}
        </>
      }
      right={
        <>
          {!calendar && (
            <button type="button" onClick={onExport} className={btnSecondary}>
              <Download className="w-4 h-4" aria-hidden="true" />
              Export .ics
            </button>
          )}
          <button type="button" onClick={onAddDate} className={btnPrimary}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add Date
          </button>
        </>
      }
    />
  );
}

/** The app (when given), type, status and "From vault" pills. */
export const DateTags: React.FC<{ item: ImportantDate; tone: DateTone; app?: string }> = ({ item, tone, app }) => {
  const [statusTone, statusText] = STATUS_PILL[item.status] ?? STATUS_PILL.open;
  return (
    <>
      {app && (
        <Pill tone="free" className="max-w-full">
          <span className="truncate">{app}</span>
        </Pill>
      )}
      <Pill tone={tone === 'ok' ? 'free' : tone}>{typeLabel(item.type)}</Pill>
      <Pill tone={statusTone}>{statusText}</Pill>
      {item.source === 'vault' && <Pill tone="ok">From vault</Pill>}
    </>
  );
};

const Dot = () => (
  <span aria-hidden="true" className="text-slate-400">
    ·
  </span>
);

/** "In 16 days · Due Dec 9, 2026 · Recurs yearly". */
export const DateFacts: React.FC<{ item: ImportantDate; daysDiff: number; showDue: boolean }> = ({ item, daysDiff, showDue }) => {
  const rel = formatDaysDiff(daysDiff);
  const relCls =
    item.status === 'done'
      ? 'text-slate-400'
      : rel.urgency === 'overdue'
        ? 'font-semibold text-rose-600 dark:text-rose-400'
        : rel.urgency === 'urgent'
          ? 'font-semibold text-amber-700 dark:text-amber-400'
          : 'font-semibold text-slate-300';
  const rec = recurrenceText(item);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-400">
      <span className={relCls}>{rel.label}</span>
      {showDue && (
        <>
          <Dot />
          <span>{dueText(item)}</span>
        </>
      )}
      {rec && (
        <>
          <Dot />
          <span className="inline-flex items-center gap-1">
            <RotateCw className="w-3 h-3 text-indigo-400" aria-hidden="true" />
            {rec}
          </span>
        </>
      )}
    </p>
  );
};

/** Last automatic check of a domain / SSL date, with "Check now" and what it found. */
export const DateCheck: React.FC<{ item: ImportantDate }> = ({ item }) => {
  const check = useCheckNow(item);
  const Icon = item.type === 'SSL expiry' ? ShieldCheck : Globe;
  const tone =
    check.tone === 'warn'
      ? 'text-amber-700 dark:text-amber-400'
      : check.tone === 'none'
        ? 'text-slate-400'
        : 'text-emerald-700 dark:text-emerald-400';
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs">
      <span className={`inline-flex flex-wrap items-center gap-x-1.5 min-w-0 ${tone}`}>
        <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="font-mono text-slate-200 break-all">{item.checkTarget}</span>
        <span className="break-words">· {check.text}</span>
      </span>
      {check.canCheck && (
        <button type="button" onClick={check.run} disabled={check.busy} className={btnSmall}>
          {check.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />}
          Check now
        </button>
      )}
      {check.msg && (
        <span role="status" className="text-slate-300">
          {check.msg}
        </span>
      )}
    </div>
  );
};

/** The check line (domain / SSL dates with a target) and the notes. */
export const DateExtras: React.FC<{ item: ImportantDate }> = ({ item }) => (
  <>
    {isCheckable(item) && item.checkTarget && <DateCheck item={item} />}
    {item.notes && <p className="text-[13px] italic text-slate-400 break-words">&ldquo;{item.notes}&rdquo;</p>}
  </>
);

/** Done, Snooze (open dates only), Edit and Delete. */
export const DateActions: React.FC<{
  item: ImportantDate;
  list: Pick<DatesList, 'markDateDone' | 'askDelete'>;
  onEditDate: (d: ImportantDate) => void;
  onOpenSnooze: (d: ImportantDate) => void;
}> = ({ item, list, onEditDate, onOpenSnooze }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    {item.status !== 'done' && (
      <>
        <button
          type="button"
          onClick={() => list.markDateDone(item.id)}
          className={btnSmall}
          title="Mark Done (Auto-generates next date if recurring)"
        >
          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
          Done
        </button>
        <button type="button" onClick={() => onOpenSnooze(item)} className={btnSmall} title="Snooze">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          Snooze
        </button>
      </>
    )}
    <button type="button" onClick={() => onEditDate(item)} className={btnSmall} title="Edit date">
      <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
      Edit
    </button>
    <button type="button" onClick={() => list.askDelete(item)} className={iconBtn} title="Delete date" aria-label="Delete date">
      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
  </div>
);

/** "No dates yet" / "No dates match", with the same buttons as the Classic page. */
export const DatesEmptyCard: React.FC<{ empty: DatesEmpty }> = ({ empty }) => (
  <section
    aria-labelledby="dates-empty-heading"
    className="rounded-2xl bg-slate-900 border border-dashed border-slate-700 px-6 py-10 flex flex-col items-center text-center gap-2"
  >
    <CalendarIcon className="w-7 h-7 text-indigo-400" aria-hidden="true" />
    <h2 id="dates-empty-heading" className="text-xl font-bold text-slate-100">
      {empty.title}
    </h2>
    <p className="text-sm text-slate-300 max-w-md">{empty.description}</p>
    <div className="mt-3 flex flex-wrap justify-center gap-2">
      <button type="button" onClick={empty.onAction} className={btnPrimary}>
        {empty.actionLabel}
      </button>
      {empty.secondaryActionLabel && empty.onSecondaryAction && (
        <button type="button" onClick={empty.onSecondaryAction} className={btnSecondary}>
          {empty.secondaryActionLabel}
        </button>
      )}
    </div>
  </section>
);
