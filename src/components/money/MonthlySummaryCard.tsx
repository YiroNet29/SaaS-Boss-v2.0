import React, { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { formatCurrency } from '../../utils/formatters';
import { changeLine, monthName, shiftMonth, summarizeMonth, type SummaryRow } from '../../utils/monthlySummary';

const usd = (n: number) => formatCurrency(n, 'USD');

const Bars: React.FC<{ title: string; rows: SummaryRow[]; total: number }> = ({ title, rows, total }) => (
  <div className="space-y-1.5">
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-slate-400">{title}</h3>
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.name} className="text-xs">
          <div className="flex justify-between gap-2">
            <span className="truncate text-stone-800 dark:text-slate-200">{r.name}</span>
            <span className="font-mono text-stone-600 dark:text-slate-300 shrink-0">{usd(r.usd)}</span>
          </div>
          <div className="h-1.5 mt-1 rounded-full bg-stone-200 dark:bg-slate-800 overflow-hidden">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${total ? Math.max(2, (r.usd / total) * 100) : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  </div>
);

/** What a month cost, by product, by card or person, and the biggest services (same as the Telegram summary). */
export const MonthlySummaryCard: React.FC = () => {
  const { payments, services, products, paymentSources, currentWorkspace } = useWorkspace();
  const rate = currentWorkspace.exchangeRates?.ETB_per_USD || 155;
  const thisMonth = new Date().toLocaleDateString('en-CA').slice(0, 7);
  // The last 12 months, newest first; starts on last month (the one that's complete).
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => shiftMonth(thisMonth, -i)), [thisMonth]);
  const [month, setMonth] = useState(() => shiftMonth(thisMonth, -1));
  const s = useMemo(
    () => summarizeMonth({ payments, services, products, sources: paymentSources, etbPerUsd: rate }, month),
    [payments, services, products, paymentSources, rate, month]
  );
  // A month still in progress isn't compared with a full one.
  const change = month === thisMonth ? null : changeLine(s);

  return (
    <section aria-labelledby="monthly-title" className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="monthly-title" className="text-sm font-bold text-stone-900 dark:text-slate-100 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-indigo-400" /> Monthly summary
        </h2>
        <select
          aria-label="Month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg bg-stone-50 dark:bg-slate-800 border border-stone-300 dark:border-slate-700 text-xs text-stone-800 dark:text-slate-100"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {monthName(m)}
              {m === thisMonth ? ' (so far)' : ''}
            </option>
          ))}
        </select>
      </div>

      {s.count === 0 ? (
        <p className="text-xs text-stone-500 dark:text-slate-400">No payments recorded in {monthName(month)}.</p>
      ) : (
        <>
          <div>
            <p className="text-2xl font-extrabold text-stone-900 dark:text-slate-100 font-mono">{usd(s.totalUsd)}</p>
            <p className="text-xs text-stone-500 dark:text-slate-400">
              {s.etbEstimated ? '≈ ' : ''}
              {formatCurrency(s.totalEtb, 'ETB')} · {s.count} payment{s.count === 1 ? '' : 's'}
              {change ? ` · ${change}` : ''}
            </p>
            {s.etbEstimated && (
              <p className="text-[11px] text-stone-400 dark:text-slate-500 mt-0.5">
                Birr is what you entered as "Cost in birr", estimated at today's rate where it's missing.
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Bars title="By product" rows={s.byProduct} total={s.totalUsd} />
            <Bars title="Paid with" rows={s.bySource} total={s.totalUsd} />
            <Bars title="Biggest" rows={s.topServices} total={s.totalUsd} />
          </div>
          {s.withoutReceipt > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              🧾 {s.withoutReceipt} payment{s.withoutReceipt === 1 ? ' has' : 's have'} no receipt yet. Send them to the Telegram bot or add them on the Receipts page.
            </p>
          )}
        </>
      )}
    </section>
  );
};
