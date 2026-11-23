import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { GetStartedCard } from './GetStartedCard';
import { MoneyAlertsBanner } from './MoneyAlertsBanner';
import { formatCurrency } from '../../utils/formatters';
import { summarizeUpcoming, relativeDays } from '../../utils/summary';
import { extractDomainItems } from '../../utils/domainExpiry';
import { FALLBACK_ETB_PER_USD } from '../../utils/fx';
import {
  dueRows,
  timelineMarks,
  monthTicks,
  monthlyCostByApp,
  shortDate,
  type DueRow,
  type DueTone,
  type TimelineMark,
  withTrialEnds,
} from '../../utils/timeline';
import type { ServiceLink } from '../../types';
import { PILL, DOT } from './tones';

interface Props {
  onSelectTab: (tab: string) => void;
  onOpenProductModal: () => void;
  onOpenTemplatePicker: () => void;
  onSelectProduct: (productId: string) => void;
  onOpenServiceModal: () => void;
  onEditService: (service: ServiceLink) => void;
}

const WINDOW_DAYS = 60;
const NEXT_UP_ROWS = 8;
/** The line never gets narrower than this; on a phone it scrolls sideways inside its box. */
const LINE_MIN_WIDTH = 760;
const LABEL_PX = 124;

const LEGEND: [DueTone, string][] = [
  ['auto', 'Renews by itself'],
  ['usage', 'Price changes with use'],
  ['manual', 'Renew by hand'],
  ['date', 'A date to check'],
];

const usd = (n: number) => formatCurrency(Math.round(n * 100) / 100, 'USD');
const etb = (n: number) => formatCurrency(Math.round(n), 'ETB');

const Stat: React.FC<{ label: string; children: React.ReactNode; onClick: () => void; className?: string }> = ({
  label,
  children,
  onClick,
  className = '',
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-left px-4 py-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 transition-colors min-w-0 sm:min-w-[150px] ${className}`}
  >
    <span className="block text-xs text-slate-400">{label}</span>
    <span className="block text-lg font-semibold text-slate-100 tabular-nums">{children}</span>
  </button>
);

/**
 * The Timeline layout's Dashboard: what's coming up on a 60-day line, the next items as a list, what each
 * app costs a month, and any card top-ups. Everything opens the matching page or form.
 */
export const TimelineDashboard: React.FC<Props> = ({
  onSelectTab,
  onOpenProductModal,
  onOpenTemplatePicker,
  onSelectProduct,
  onOpenServiceModal,
  onEditService,
}) => {
  const { currentWorkspace, products, services, dates, dueSoonGroups, overdueCount, totalCosts, isDemoMode, todayStr } = useWorkspace();
  const rate = currentWorkspace.exchangeRates?.ETB_per_USD || FALLBACK_ETB_PER_USD;
  const today = todayStr;

  const rows = useMemo(
    () => withTrialEnds(dueRows(dueSoonGroups, rate, WINDOW_DAYS), services, products, today, WINDOW_DAYS),
    [dueSoonGroups, rate, services, products, today]
  );
  // The line's real width decides how many labels fit (a 124px label plus a small gap).
  const lineRef = useRef<HTMLDivElement>(null);
  const hasLine = rows.some((r) => r.daysDiff >= 0); // the line is drawn only when something is upcoming
  const [lineWidth, setLineWidth] = useState(LINE_MIN_WIDTH);
  useEffect(() => {
    const el = lineRef.current;
    if (!el) return;
    const measure = (width: number) => setLineWidth(Math.max(LINE_MIN_WIDTH, Math.round(width)));
    measure(el.getBoundingClientRect().width); // now, then whenever the window or panel changes size
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasLine]);
  const marks = useMemo(() => timelineMarks(rows, WINDOW_DAYS, 4, (LABEL_PX + 8) / lineWidth), [rows, lineWidth]);
  const ticks = useMemo(() => monthTicks(today, WINDOW_DAYS), [today]);
  const apps = useMemo(() => monthlyCostByApp(products, services, rate), [products, services, rate]);
  const upcoming = useMemo(
    () => summarizeUpcoming(services, extractDomainItems(services, dates, products), rate, today),
    [services, dates, products, rate, today]
  );
  const maxApp = Math.max(0, ...apps.map((a) => a.monthlyUsd));

  const open = (r: DueRow) => {
    if (r.service) onEditService(r.service);
    else onSelectTab('dates');
  };
  const openMark = (m: TimelineMark) => (m.rows.length === 1 ? open(m.rows[0]) : onSelectTab('dates'));

  return (
    <div className="space-y-7 pb-20 md:pb-8">
      <GetStartedCard
        onAddApp={onOpenProductModal}
        onUseTemplate={onOpenTemplatePicker}
        onAddService={onOpenServiceModal}
        onSelectTab={onSelectTab}
      />

      {/* Title and the three numbers */}
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
            {currentWorkspace.name}
            {isDemoMode ? ' · Example data' : ''}
          </p>
          <h1 className="text-4xl md:text-[44px] leading-[1.05] font-bold tracking-tight text-slate-100">What&apos;s coming up</h1>
        </div>
        <div className="grid grid-cols-2 w-full sm:w-auto sm:flex sm:flex-wrap gap-2.5">
          <Stat label="This month" onClick={() => onSelectTab('services')} className="col-span-2">
            {usd(totalCosts.totalUsd)} <span className="text-sm font-normal text-slate-400">· {etb(totalCosts.totalEtb)}</span>
          </Stat>
          <Stat label="Next 30 days" onClick={() => onSelectTab('dates')}>
            {upcoming.renewals.count} renewal{upcoming.renewals.count === 1 ? '' : 's'}{' '}
            <span className="block sm:inline text-sm font-normal text-slate-400">
              <span className="hidden sm:inline">· </span>
              {usd(upcoming.renewals.totalUsd)}
            </span>
          </Stat>
          <Stat label="Overdue" onClick={() => onSelectTab('dates')}>
            {overdueCount ? (
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-500" aria-hidden="true" />
                {overdueCount} item{overdueCount === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                None
              </span>
            )}
          </Stat>
        </div>
      </div>

      {/* The line */}
      <section aria-labelledby="timeline-heading" className="px-5 md:px-6 pt-5 pb-4 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="flex flex-wrap justify-between items-baseline gap-3">
          <div>
            <h2 id="timeline-heading" className="text-2xl font-bold text-slate-100">
              Next {WINDOW_DAYS} days
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              <span className="inline-block w-0.5 h-2.5 mr-1.5 align-middle bg-indigo-500" aria-hidden="true" />
              The line starts today, {shortDate(today)}
            </p>
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400" aria-label="What the colours mean">
            {LEGEND.map(([tone, text]) => (
              <li key={tone} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${DOT[tone]}`} aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        {marks.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">Nothing is due in the next {WINDOW_DAYS} days.</p>
        ) : (
          <div className="overflow-x-auto -mx-2 px-2">
            <div ref={lineRef} className="relative h-[204px] min-w-[760px] mt-4">
              <div className="absolute left-0 right-0 top-[99px] h-0.5 bg-slate-700" aria-hidden="true" />
              <div className="absolute left-0 top-[86px] w-0.5 h-7 bg-indigo-500" aria-hidden="true" />
              {ticks.map((t) => (
                <React.Fragment key={t.label}>
                  <div className="absolute top-[93px] w-px h-3.5 bg-slate-500" style={{ left: `${t.at * 100}%` }} aria-hidden="true" />
                  <span
                    className={`absolute top-[182px] text-xs text-slate-400 ${t.at < 0.08 ? '' : '-translate-x-1/2'}`}
                    style={{ left: `${t.at * 100}%` }}
                  >
                    {t.label}
                  </span>
                </React.Fragment>
              ))}
              <ol aria-label={`Due in the next ${WINDOW_DAYS} days`}>
                {marks.map((m) => {
                  const left = `${m.at * 100}%`;
                  const above = m.side === 'above';
                  const shift = m.align === 'start' ? '' : m.align === 'end' ? '-translate-x-full text-right' : '-translate-x-1/2 text-center';
                  const title = m.rows.length === 1 ? m.rows[0].name : `${m.rows.length} due`;
                  const names = m.rows.map((r) => r.name).join(', ');
                  return (
                    <li key={`${m.at}-${title}`}>
                      <div
                        className={`absolute w-px bg-slate-700 ${above ? 'top-[46px] h-[44px]' : 'top-[108px] h-[18px]'}`}
                        style={{ left }}
                        aria-hidden="true"
                      />
                      <div
                        className={`absolute top-[92px] w-4 h-4 -ml-2 rounded-full ring-4 ring-slate-900 ${DOT[m.tone]}`}
                        style={{ left }}
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        onClick={() => openMark(m)}
                        title={m.rows.length > 1 ? names : undefined}
                        aria-label={`${m.rows.length > 1 ? `${names}: ` : `${title}, `}${m.when}${m.usd !== undefined ? `, ${usd(m.usd)}` : ''}`}
                        className={`absolute ${above ? 'top-0' : 'top-[128px]'} ${shift} w-[124px] px-1 py-0.5 rounded-lg hover:bg-slate-800/60 transition-colors`}
                        style={{ left }}
                      >
                        <span className="block text-[13px] font-semibold text-slate-100 truncate">{title}</span>
                        <span className="block text-xs text-slate-400 truncate">
                          {m.when}
                          {m.usd !== undefined ? ` · ${usd(m.usd)}` : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-6 items-start">
        {/* Next up */}
        <section
          aria-labelledby="next-up-heading"
          className="flex-[999_1_520px] min-w-0 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden"
        >
          <div className="flex justify-between items-baseline px-5 py-4 border-b border-slate-800">
            <h2 id="next-up-heading" className="text-xl font-bold text-slate-100">
              Next up
            </h2>
            <button type="button" onClick={() => onSelectTab('dates')} className="text-sm font-medium text-indigo-400 hover:text-indigo-300">
              All dates
            </button>
          </div>
          {rows.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-400">Nothing overdue and nothing due in the next {WINDOW_DAYS} days.</p>
          ) : (
            <ul>
              {rows.slice(0, NEXT_UP_ROWS).map((r) => {
                const overdue = r.daysDiff < 0;
                return (
                  <li key={r.id} className="border-b border-slate-800 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => open(r)}
                      className="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.4fr)_7.5rem] gap-x-3.5 gap-y-1 items-center px-5 py-3.5 hover:bg-slate-800/50 transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold text-slate-100 truncate">{r.name}</span>
                        <span className="block text-xs text-slate-400 truncate">{r.appName}</span>
                      </span>
                      <span
                        className={`order-2 sm:order-none justify-self-end sm:col-start-4 sm:row-start-1 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
                          PILL[overdue ? 'overdue' : r.tone]
                        }`}
                      >
                        {overdue ? 'Overdue' : r.label}
                      </span>
                      <span className="order-3 sm:order-none sm:col-start-2 sm:row-start-1 text-[13px] text-slate-300">
                        {shortDate(r.dueDate)} · {relativeDays(r.daysDiff)}
                      </span>
                      <span className="order-4 sm:order-none sm:col-start-3 sm:row-start-1 text-right sm:text-left text-[13px] font-semibold text-slate-100">
                        {r.usd !== undefined ? (
                          <>
                            {usd(r.usd)} <span className="font-normal text-slate-400">· {etb(r.etb ?? 0)}</span>
                          </>
                        ) : (
                          <span className="font-normal text-slate-400">No amount</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {rows.length > NEXT_UP_ROWS && (
            <button
              type="button"
              onClick={() => onSelectTab('dates')}
              className="w-full px-5 py-3 text-sm text-left text-indigo-400 hover:text-indigo-300 border-t border-slate-800"
            >
              {rows.length - NEXT_UP_ROWS} more in Dates
            </button>
          )}
        </section>

        {/* By app, and card top-ups */}
        <div className="flex-[1_1_300px] min-w-0 space-y-5">
          <section aria-labelledby="by-app-heading" className="px-5 py-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex justify-between items-baseline">
              <h2 id="by-app-heading" className="text-xl font-bold text-slate-100">
                By app, per month
              </h2>
              <button type="button" onClick={() => onSelectTab('products')} className="text-sm font-medium text-indigo-400 hover:text-indigo-300">
                All apps
              </button>
            </div>
            {apps.length === 0 ? (
              <p className="text-sm text-slate-400">No apps yet.</p>
            ) : (
              <ul className="space-y-3.5">
                {apps.slice(0, 6).map((a) => (
                  <li key={a.product.id}>
                    <button
                      type="button"
                      onClick={() => onSelectProduct(a.product.id)}
                      className="w-full text-left space-y-1.5 rounded-lg hover:bg-slate-800/40 -mx-1.5 px-1.5 py-1 transition-colors"
                    >
                      <span className="flex justify-between gap-2.5 text-sm">
                        <span className="font-semibold text-slate-100 truncate">{a.product.name}</span>
                        <span className="text-slate-200 whitespace-nowrap">
                          {usd(a.monthlyUsd)} <span className="text-slate-400">· {etb(a.monthlyEtb)}</span>
                        </span>
                      </span>
                      <span className="block h-2 rounded-full bg-slate-800 overflow-hidden" aria-hidden="true">
                        <span
                          className="block h-full rounded-full bg-indigo-500"
                          style={{ width: `${maxApp > 0 ? Math.max(2, (a.monthlyUsd / maxApp) * 100) : 0}%` }}
                        />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <MoneyAlertsBanner onOpen={() => onSelectTab('money')} />
        </div>
      </div>
    </div>
  );
};
