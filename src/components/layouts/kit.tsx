/**
 * Building blocks for the Timeline and Portfolio pages, so every page in those layouts shares one look:
 * a page head (eyebrow, big title, the key numbers), roomy cards, round buttons, filter chips and pills.
 * Only slate / indigo / status colours are used, which every theme re-colours (see app/globals.css), so the
 * pages stay readable in all six themes.
 */
import React from 'react';
import { Search, X, ArrowLeft } from 'lucide-react';
import { PILL, DOT, type PillTone } from '../dashboard/tones';

export { PILL, DOT, type PillTone };

/** Round primary button (the accent colour). */
export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-60 whitespace-nowrap';
/** Round secondary button. */
export const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-full border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-sm font-medium transition-colors disabled:opacity-60 whitespace-nowrap';
/** Small variants for actions inside rows. */
export const btnSmall =
  'inline-flex items-center justify-center gap-1 min-h-[32px] px-3 rounded-full border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition-colors disabled:opacity-60 whitespace-nowrap';
export const btnSmallPrimary =
  'inline-flex items-center justify-center gap-1 min-h-[32px] px-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors disabled:opacity-60 whitespace-nowrap';
/** Small text link in the accent colour. */
export const linkCls = 'text-sm font-semibold text-indigo-400 hover:text-indigo-300';
/** Text inputs and selects inside the new pages (same classes the forms use, so themes cover them). */
export const inputCls =
  'w-full min-h-[40px] px-3 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-indigo-500';

/** "Eyebrow · Title · sentence" with the key numbers on the right. */
export const PageHead: React.FC<{
  eyebrow: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  stats?: React.ReactNode;
  back?: { label: string; onClick: () => void };
}> = ({ eyebrow, title, sub, stats, back }) => (
  <div className="flex flex-wrap items-end justify-between gap-5">
    <div className="space-y-2 min-w-0 max-w-3xl">
      {back && (
        <button type="button" onClick={back.onClick} className={`inline-flex items-center gap-1.5 mb-1 ${linkCls}`}>
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          {back.label}
        </button>
      )}
      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{eyebrow}</p>
      <h1 className="text-4xl md:text-[44px] leading-[1.05] font-bold tracking-tight text-slate-100 break-words">{title}</h1>
      {sub && <div className="text-[15px] text-slate-300">{sub}</div>}
    </div>
    {stats && <div className="grid grid-cols-2 w-full sm:w-auto sm:flex sm:flex-wrap gap-2.5">{stats}</div>}
  </div>
);

/** A number tile in the page head. `tone` colours the value (ok / warn / bad). */
export const Stat: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'ok' | 'warn' | 'bad';
  onClick?: () => void;
  className?: string;
}> = ({ label, value, sub, tone, onClick, className = '' }) => {
  const toneCls = tone === 'bad' ? 'text-rose-600 dark:text-rose-400' : tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : tone === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-100';
  const inner = (
    <>
      <span className="block text-xs text-slate-400">{label}</span>
      <span className={`block text-lg font-semibold tabular-nums ${toneCls}`}>
        {value}
        {sub && <span className="text-sm font-normal text-slate-400"> · {sub}</span>}
      </span>
    </>
  );
  const cls = `text-left px-4 py-3 rounded-2xl bg-slate-900 border border-slate-800 min-w-0 sm:min-w-[140px] ${className}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} hover:border-indigo-500/50 transition-colors`}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
};

/** A card with an optional header row (title on the left, links or buttons on the right). */
export const Section: React.FC<{
  title?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  /** Padding inside the body (off for lists whose rows have their own). */
  padded?: boolean;
}> = ({ title, right, children, className = '', id, padded = false }) => {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section id={id} aria-labelledby={title ? headingId : undefined} className={`rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden ${className}`}>
      {(title || right) && (
        <div className="flex flex-wrap justify-between items-center gap-3 px-5 py-4 border-b border-slate-800">
          {title && (
            <h2 id={headingId} className="text-xl font-bold text-slate-100 min-w-0">
              {title}
            </h2>
          )}
          {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
};

/** Small uppercase label above a group of rows ("NEXT 2 WEEKS"). */
export const GroupLabel: React.FC<{ children: React.ReactNode; tone?: 'bad'; id?: string }> = ({ children, tone, id }) => (
  <h2 id={id} className={`text-xs font-bold uppercase tracking-[0.14em] ${tone === 'bad' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
    {children}
  </h2>
);

/** A status pill. */
export const Pill: React.FC<{ tone: PillTone; children: React.ReactNode; className?: string }> = ({ tone, children, className = '' }) => (
  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${PILL[tone]} ${className}`}>{children}</span>
);

/** Filters and actions above a list: left group and right group, wrapping on small screens. */
export const Toolbar: React.FC<{ left?: React.ReactNode; right?: React.ReactNode }> = ({ left, right }) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex flex-wrap items-center gap-2 min-w-0">{left}</div>
    <div className="flex flex-wrap items-center gap-2">{right}</div>
  </div>
);

/** A rounded search box with a clear button. */
export const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string; label?: string }> = ({
  value,
  onChange,
  placeholder,
  label,
}) => (
  <div className="relative flex items-center min-w-[220px] flex-1 sm:flex-none sm:w-72">
    <Search className="w-4 h-4 absolute left-3.5 text-slate-400 pointer-events-none" aria-hidden="true" />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label ?? placeholder}
      className="w-full min-h-[40px] pl-10 pr-9 rounded-full bg-slate-900 border border-slate-700 text-sm text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-indigo-500"
    />
    {value && (
      <button type="button" onClick={() => onChange('')} className="absolute right-2.5 p-1 rounded-full text-slate-400 hover:text-slate-200" aria-label="Clear search">
        <X className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
);

/** A filter chip that is on or off. */
export const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; label?: string }> = ({ active, onClick, children, label }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    aria-label={label}
    className={`inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-full border text-sm transition-colors ${
      active ? 'bg-indigo-600 border-indigo-600 text-white font-semibold' : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-slate-100'
    }`}
  >
    {children}
  </button>
);

/** A dropdown that looks like a chip (a native select, so it works with the keyboard and screen readers). */
export function SelectChip<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      aria-label={label}
      className="min-h-[34px] pl-3 pr-8 rounded-full border border-slate-700 bg-slate-900 text-sm text-slate-200 focus:outline-hidden focus:border-indigo-500"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Two or three views of one page ("By app | By provider"). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex p-1 rounded-full border border-slate-700 bg-slate-900">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`px-3.5 py-1.5 rounded-full text-sm transition-colors ${
            o.value === value ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-300 hover:text-slate-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A thin progress bar with an optional caption. */
export const Bar: React.FC<{ pct: number; tone?: 'ok' | 'warn' | 'bad' | 'accent'; caption?: React.ReactNode; label?: string }> = ({ pct, tone = 'accent', caption, label }) => (
  <div className="space-y-1.5 min-w-0">
    <div
      className="h-2 rounded-full bg-slate-800 overflow-hidden"
      role={label ? 'progressbar' : undefined}
      aria-label={label}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      aria-valuenow={label ? Math.round(Math.min(100, Math.max(0, pct))) : undefined}
      aria-hidden={label ? undefined : true}
    >
      <div className={`h-full rounded-full ${tone === 'accent' ? 'bg-indigo-500' : DOT[tone]}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
    {caption && <p className="text-xs text-slate-400">{caption}</p>}
  </div>
);

/** Two lines: a strong name and a quieter detail. */
export const TwoLine: React.FC<{ title: React.ReactNode; sub?: React.ReactNode; className?: string }> = ({ title, sub, className = '' }) => (
  <span className={`min-w-0 flex flex-col ${className}`}>
    <span className="text-sm font-semibold text-slate-100 truncate">{title}</span>
    {sub && <span className="text-xs text-slate-400 truncate">{sub}</span>}
  </span>
);

/** Page wrapper: the vertical rhythm every Timeline / Portfolio page uses. */
export const Page: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="space-y-6 pb-20 md:pb-8">{children}</div>;
