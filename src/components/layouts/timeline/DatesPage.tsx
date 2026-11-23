import React, { useMemo, useState } from 'react';
import type { ImportantDate, ServiceLink } from '../../../types';
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
import { formatDaysDiff } from '../../../utils/formatters';
import {
  dateEntry,
  dateStats,
  dateTone,
  dayParts,
  plural,
  renewalEntries,
  renewalInfo,
  timelineBlocks,
  type DateEntry,
} from '../../../utils/datePages';
import { Chip, DOT, GroupLabel, Page, PageHead, Pill, Stat, btnSmall } from '../kit';

type Props = DatesPageProps;

type View = 'timeline' | 'calendar';
const VIEWS: { value: View; label: string }[] = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'calendar', label: 'Calendar' },
];

/** Day columns: day number | the line | the card. The month headings line up with the cards. */
const ROW = 'grid grid-cols-[3rem_1rem_minmax(0,1fr)] sm:grid-cols-[4rem_1.625rem_minmax(0,1fr)] gap-x-2 sm:gap-x-3';
const HEADING_INDENT = 'pl-[5rem] sm:pl-[7.125rem]';

/** The day number and weekday on the left of an entry. */
const DayCell: React.FC<{ day: string; withMonth: boolean; today: string }> = ({ day, withMonth, today }) => {
  const { num, sub } = dayParts(day, withMonth, today);
  return (
    <div className="text-right pt-3">
      <span className="block text-xl sm:text-[22px] font-semibold leading-none tabular-nums text-slate-100">{num}</span>
      <span className="block text-xs text-slate-400 mt-1">{sub}</span>
    </div>
  );
};

/** The vertical line with the entry's dot on it (a smaller dot for renewals). */
const LineCell: React.FC<{ dot: keyof typeof DOT; small?: boolean }> = ({ dot, small }) => (
  <div className="relative" aria-hidden="true">
    <span className="absolute left-1/2 -ml-px top-0 bottom-0 w-0.5 bg-slate-700" />
    <span
      className={`absolute left-1/2 rounded-full ${DOT[dot]} ${small ? 'top-[21px] w-2.5 h-2.5 -ml-[5px]' : 'top-[18px] w-3.5 h-3.5 -ml-[7px]'}`}
    />
  </div>
);

const DateCard: React.FC<{
  item: ImportantDate;
  daysDiff: number;
  list: DatesList;
  onEditDate: (d: ImportantDate) => void;
  onOpenSnooze: (d: ImportantDate) => void;
}> = ({ item, daysDiff, list, onEditDate, onOpenSnooze }) => (
  <article className="rounded-2xl bg-slate-900 border border-slate-800 px-4 py-3 my-1 flex flex-wrap justify-between items-center gap-3">
    <div className="min-w-0 flex-[1_1_320px] space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-semibold text-slate-100 break-words min-w-0">{item.title}</h3>
        <DateTags item={item} tone={dateTone(item.status, daysDiff)} app={list.appName(item)} />
      </div>
      <DateFacts item={item} daysDiff={daysDiff} showDue />
      <DateExtras item={item} />
    </div>
    <DateActions item={item} list={list} onEditDate={onEditDate} onOpenSnooze={onOpenSnooze} />
  </article>
);

/** A service renewal, lighter than the dates: dashed card, smaller dot. */
const RenewalCard: React.FC<{ entry: DateEntry; app?: string; onEditService?: (s: ServiceLink) => void }> = ({
  entry,
  app,
  onEditService,
}) => {
  const { paymentSources } = useWorkspace();
  const s = entry.service!;
  const info = renewalInfo(s, paymentSources, entry.daysDiff);
  const rel = formatDaysDiff(entry.daysDiff);
  return (
    <article className="rounded-2xl bg-slate-900/60 border border-dashed border-slate-700 px-4 py-2.5 my-1 flex flex-wrap justify-between items-center gap-3">
      <div className="min-w-0 flex-[1_1_320px] space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-200 break-words min-w-0">{entry.title}</h3>
          {app && (
            <Pill tone="free" className="max-w-full">
              <span className="truncate">{app}</span>
            </Pill>
          )}
          <Pill tone={info.tone}>{info.label}</Pill>
        </div>
        <p className="text-[13px] text-slate-400">
          <span className={rel.urgency === 'overdue' ? 'text-rose-600 dark:text-rose-400' : ''}>{rel.label}</span>
          {info.sub && ` · ${info.sub}`}
        </p>
      </div>
      {onEditService && (
        <button type="button" onClick={() => onEditService(s)} className={btnSmall}>
          Edit service
        </button>
      )}
    </article>
  );
};

/** Timeline layout: Dates. Overdue first, then a block per month on a vertical line; renewals show lighter. */
export const DatesPage: React.FC<Props> = ({ onAddDate, onEditDate, onOpenSnooze, onEditService }) => {
  const list = useDatesList(onAddDate);
  const exportIcs = useIcsExport(list.dates, list.services, list.products);
  const [view, setView] = useState<View>('timeline');
  const [showRenewals, setShowRenewals] = useState(true);
  const today = list.todayStr;

  const stats = useMemo(() => dateStats(list.dates, list.services, today), [list.dates, list.services, today]);
  const renewals = showRenewals ? renewalEntries(list.services, list.prodMap, list.filters, today) : [];
  const blocks = timelineBlocks([...list.filteredDates.map((d) => dateEntry(d, today)), ...renewals]);

  return (
    <Page>
      <PageHead
        eyebrow="Dates"
        title="Dates, month by month"
        sub="Domain and SSL expiry, key rotations, invoices, trials and contracts. Service renewals show lighter, so you see the whole month."
        stats={
          <>
            <Stat
              label="Overdue"
              value={
                stats.overdue
                  ? plural(stats.overdue, 'date')
                  : showRenewals && stats.renewalsOverdue
                    ? plural(stats.renewalsOverdue, 'renewal')
                    : 'None'
              }
              sub={stats.overdue && showRenewals && stats.renewalsOverdue ? `+ ${plural(stats.renewalsOverdue, 'renewal')}` : undefined}
              tone={stats.overdue || (showRenewals && stats.renewalsOverdue) ? 'bad' : 'ok'}
            />
            <Stat label="Next 30 days" value={plural(stats.next30, 'date')} sub={stats.renewals30 ? `+ ${plural(stats.renewals30, 'renewal')}` : undefined} />
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
        extra={
          <Chip active={showRenewals} onClick={() => setShowRenewals((on) => !on)}>
            Show renewals
          </Chip>
        }
        onExport={exportIcs}
        onAddDate={onAddDate}
      />

      {view === 'calendar' ? (
        <CalendarView dates={list.dates} services={list.services} products={list.products} onSelectDateItem={(d) => onEditDate(d)} />
      ) : (
        <>
          {list.empty && <DatesEmptyCard empty={list.empty} />}
          {blocks.length > 0 && (
            <div className="space-y-6">
              {blocks.map((b) => {
                const headingId = `dates-block-${b.key}`;
                return (
                  <section key={b.key} aria-labelledby={headingId} className="space-y-1">
                    <div className={HEADING_INDENT}>
                      <GroupLabel id={headingId} tone={b.overdue ? 'bad' : undefined}>
                        {b.label}
                      </GroupLabel>
                    </div>
                    <ul>
                      {b.entries.map((e) => {
                        const isDate = e.kind === 'date';
                        const dot = isDate ? dateTone(e.date!.status, e.daysDiff) : renewalInfo(e.service!, [], e.daysDiff).dot;
                        return (
                          <li key={e.key} className={ROW}>
                            <DayCell day={e.day} withMonth={b.overdue} today={today} />
                            <LineCell dot={dot} small={!isDate} />
                            <div className="min-w-0">
                              {isDate ? (
                                <DateCard item={e.date!} daysDiff={e.daysDiff} list={list} onEditDate={onEditDate} onOpenSnooze={onOpenSnooze} />
                              ) : (
                                <RenewalCard entry={e} app={list.prodMap.get(e.service!.productId)} onEditService={onEditService} />
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      <DeleteDateDialog list={list} />
    </Page>
  );
};
