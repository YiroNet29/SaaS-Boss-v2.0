import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DOT } from '../kit';
import { formatCurrency } from '../../../utils/formatters';
import { monthTicks, timelineMarks, type DueRow, type DueTone, type TimelineMark } from '../../../utils/timeline';

/** What the dot colours mean (the same words as the Timeline dashboard). */
export const LINE_LEGEND: [DueTone, string][] = [
  ['auto', 'Renews by itself'],
  ['usage', 'Price changes with use'],
  ['manual', 'Renew by hand'],
  ['date', 'A date to check'],
];

export const LineLegend: React.FC = () => (
  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400" aria-label="What the colours mean">
    {LINE_LEGEND.map(([tone, text]) => (
      <li key={tone} className="flex items-center gap-1.5">
        <span className={`w-2.5 h-2.5 rounded-full ${DOT[tone]}`} aria-hidden="true" />
        {text}
      </li>
    ))}
  </ul>
);

const usd = (n: number) => formatCurrency(Math.round(n * 100) / 100, 'USD');

/**
 * Positions for the two sizes: `row` (one line per app on the Apps page) and `page` (one app's page,
 * the same as the dashboard's line). Kept as whole class names so Tailwind finds them.
 */
const SIZE = {
  row: {
    minWidth: 520,
    labelPx: 112,
    box: 'h-[150px] min-w-[520px]',
    label: 'w-[112px]',
    line: 'top-[66px]',
    today: 'top-[54px] h-[26px]',
    tick: 'top-[60px] h-3.5',
    tickLabel: 'top-[130px]',
    dot: 'top-[59px]',
    upLink: 'top-[38px] h-[22px]',
    downLink: 'top-[75px] h-[10px]',
    up: 'top-0',
    down: 'top-[86px]',
    empty: 'top-[34px]',
  },
  page: {
    minWidth: 760,
    labelPx: 124,
    box: 'h-[204px] min-w-[760px]',
    label: 'w-[124px]',
    line: 'top-[99px]',
    today: 'top-[86px] h-7',
    tick: 'top-[93px] h-3.5',
    tickLabel: 'top-[182px]',
    dot: 'top-[92px]',
    upLink: 'top-[46px] h-[44px]',
    downLink: 'top-[108px] h-[18px]',
    up: 'top-0',
    down: 'top-[128px]',
    empty: 'top-[60px]',
  },
} as const;

/**
 * A line from today to `windowDays` ahead with a dot for each renewal or date. Close items share one dot
 * ("3 due") and labels never overlap (see timelineMarks). On a narrow screen it scrolls inside its own box.
 */
export const DueLine: React.FC<{
  rows: DueRow[];
  /** YYYY-MM-DD, the same day the rows' daysDiff counts from. */
  today: string;
  windowDays?: number;
  size?: keyof typeof SIZE;
  /** Names the list for screen readers, e.g. "StackTrack: due in the next 90 days". */
  label: string;
  onOpen: (mark: TimelineMark) => void;
  /** Words for the action, read after each mark ("Open StackTrack"). */
  openLabel?: string;
  /** The words under the start of the line. */
  todayLabel?: string;
}> = ({ rows, today, windowDays = 90, size = 'row', label, onOpen, openLabel, todayLabel = 'Today' }) => {
  const g = SIZE[size];
  const lineRef = useRef<HTMLDivElement>(null);
  const [lineWidth, setLineWidth] = useState<number>(g.minWidth);
  useEffect(() => {
    const el = lineRef.current;
    if (!el) return;
    const measure = (width: number) => setLineWidth(Math.max(g.minWidth, Math.round(width)));
    measure(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [g.minWidth]);

  const marks = useMemo(() => timelineMarks(rows, windowDays, 4, (g.labelPx + 8) / lineWidth), [rows, windowDays, g.labelPx, lineWidth]);
  const ticks = useMemo(() => monthTicks(today, windowDays), [today, windowDays]);
  // "Today" sits under the start of the line unless a month label is right there (about 7px a letter).
  const showToday = !ticks.some((t) => t.at * lineWidth < todayLabel.length * 7 + 48);

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div ref={lineRef} className={`relative ${g.box}`}>
        <div className={`absolute left-0 right-0 h-0.5 bg-slate-700 ${g.line}`} aria-hidden="true" />
        <div className={`absolute left-0 w-0.5 bg-indigo-500 ${g.today}`} aria-hidden="true" />
        {showToday && (
          <span className={`absolute left-0 text-xs font-semibold text-slate-300 ${g.tickLabel}`} aria-hidden="true">
            {todayLabel}
          </span>
        )}
        {ticks.map((t) => (
          <React.Fragment key={t.label}>
            <div className={`absolute w-px bg-slate-500 ${g.tick}`} style={{ left: `${t.at * 100}%` }} aria-hidden="true" />
            <span
              className={`absolute text-xs text-slate-400 ${g.tickLabel} ${t.at < 0.08 ? '' : '-translate-x-1/2'}`}
              style={{ left: `${t.at * 100}%` }}
              aria-hidden="true"
            >
              {t.label}
            </span>
          </React.Fragment>
        ))}
        {marks.length === 0 ? (
          <p className={`absolute left-0 right-0 text-center text-sm text-slate-400 ${g.empty}`}>Nothing due in the next {windowDays} days.</p>
        ) : (
          <ol aria-label={label}>
            {marks.map((m) => {
              const left = `${m.at * 100}%`;
              const above = m.side === 'above';
              const shift = m.align === 'start' ? '' : m.align === 'end' ? '-translate-x-full text-right' : '-translate-x-1/2 text-center';
              const title = m.rows.length === 1 ? m.rows[0].name : `${m.rows.length} due`;
              const names = m.rows.map((r) => r.name).join(', ');
              const what = `${m.rows.length > 1 ? `${names}: ` : `${title}, `}${m.when}${m.usd !== undefined ? `, ${usd(m.usd)}` : ''}`;
              return (
                <li key={`${m.at}-${title}`}>
                  <div className={`absolute w-px bg-slate-700 ${above ? g.upLink : g.downLink}`} style={{ left }} aria-hidden="true" />
                  <div className={`absolute w-4 h-4 -ml-2 rounded-full ring-4 ring-slate-900 ${DOT[m.tone]} ${g.dot}`} style={{ left }} aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => onOpen(m)}
                    title={m.rows.length > 1 ? names : undefined}
                    aria-label={openLabel ? `${what}. ${openLabel}` : what}
                    className={`absolute ${above ? g.up : g.down} ${shift} ${g.label} px-1 py-0.5 rounded-lg hover:bg-slate-800/60 transition-colors`}
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
        )}
      </div>
    </div>
  );
};
