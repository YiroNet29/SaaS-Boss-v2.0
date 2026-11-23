import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { MoneyView } from '../../money/MoneyView';
import { useMoney, useMonthCsv, type Money } from '../../money/useMoney';
import { MoneyModals } from '../../money/MoneyModals';
import {
  MoneyStats,
  MoneyToolbar,
  MonthFacts,
  NoPayments,
  NoSources,
  PaymentList,
  ShowAllPayments,
  SourceCard,
  UnassignedNote,
  usd,
} from '../../money/MoneyPageParts';
import { GroupLabel, Page, PageHead, Section, SelectChip, TwoLine, btnSmall, linkCls } from '../kit';
import { cellServices, dayLabel, monthLine, paymentsByApp, payerMatrix } from '../../../utils/moneyPages';
import { monthName, shiftMonth, summarizeMonth } from '../../../utils/monthlySummary';
import { ORIGIN_LABEL } from '../../../utils/reports';
import { shortDate } from '../../../utils/timeline';

const HISTORY_ID = 'payment-history';

/** Portfolio layout: Cards & payments, by app. Who pays for each app, then this month's payments app by app. */
export const MoneyPage: React.FC<React.ComponentProps<typeof MoneyView>> = ({ onOpenReceipts }) => {
  const m = useMoney();
  const [historyOpen, setHistoryOpen] = useState(false);
  const openHistory = () => {
    setHistoryOpen(true);
    requestAnimationFrame(() => document.getElementById(HISTORY_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <Page>
      <PageHead
        eyebrow="Cards & payments"
        title="Who pays for each app"
        sub="Your cards and the people who pay for you, and what each app costs them."
        stats={<MoneyStats m={m} />}
      />
      <MoneyToolbar m={m} onOpenReceipts={onOpenReceipts} />

      {m.views.length === 0 ? (
        <NoSources m={m} />
      ) : (
        <section aria-labelledby="money-sources" className="space-y-3">
          <GroupLabel id="money-sources">Cards and people</GroupLabel>
          <div className="flex flex-wrap gap-4 items-start">
            {m.views.map((v) => (
              <SourceCard key={v.source.id} m={m} v={v} variant="portfolio" className="flex-[1_1_300px]" />
            ))}
          </div>
        </section>
      )}

      <UnassignedNote m={m} />
      <WhoPays m={m} />
      <PaidByApp m={m} onOpenHistory={openHistory} />
      <FullHistory m={m} open={historyOpen} onToggle={() => setHistoryOpen((o) => !o)} />
      <MoneyModals m={m} />
    </Page>
  );
};

/** Apps as rows, cards and people as columns: what each pays a month for each app. */
const WhoPays: React.FC<{ m: Money }> = ({ m }) => {
  const matrix = useMemo(() => payerMatrix(m.products, m.services, m.paymentSources, m.rate), [m.products, m.services, m.paymentSources, m.rate]);
  const owed = new Map(m.views.filter((v) => v.source.kind === 'person' && v.balance > 0.005).map((v) => [v.source.id, v]));

  return (
    <Section title="Each app, by who pays" right={<span className="text-xs text-slate-400">A month, in USD</span>}>
      {m.products.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400">No apps yet.</p>
      ) : matrix.columns.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400">Nothing is paid for yet.</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: `${20 + matrix.columns.length * 10}rem` }}>
            <caption className="sr-only">What each app costs a month, split by the card or person that pays</caption>
            <thead className="bg-slate-800/40">
              <tr>
                <th scope="col" className="w-44 px-5 py-3 text-left text-xs font-normal text-slate-400">
                  App <span aria-hidden="true">↓</span> · Paid with <span aria-hidden="true">→</span>
                </th>
                {matrix.columns.map((c) => (
                  <th key={c.key} scope="col" className="px-3 py-3 text-left text-[13px] font-semibold text-slate-100">
                    {c.name}
                    {c.source?.last4 && <span className="font-normal text-slate-400"> ·· {c.source.last4}</span>}
                  </th>
                ))}
                <th scope="col" className="px-5 py-3 text-right text-[13px] font-semibold text-slate-100">
                  Per month
                </th>
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((r) => (
                <tr key={r.product.id} className="border-t border-slate-800 align-top">
                  <th scope="row" className="px-5 py-3 text-left font-semibold text-slate-100">
                    {r.product.name}
                  </th>
                  {r.cells.map((c, i) => (
                    <td key={matrix.columns[i].key} className="px-3 py-3">
                      {c.services.length ? (
                        <>
                          <span className="block tabular-nums text-slate-100">{usd(c.usd)}</span>
                          <span className="block text-xs text-slate-400">{cellServices(c.services)}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-slate-400" aria-hidden="true">
                            —
                          </span>
                          <span className="sr-only">Nothing</span>
                        </>
                      )}
                    </td>
                  ))}
                  <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-100">{usd(r.usd)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-800/40 border-t border-slate-800">
              <tr className="align-top">
                <th scope="row" className="px-5 py-3 text-left text-xs font-normal text-slate-400">
                  Per month
                </th>
                {matrix.columnUsd.map((total, i) => {
                  const src = matrix.columns[i].source;
                  const o = src ? owed.get(src.id) : undefined;
                  return (
                    <td key={matrix.columns[i].key} className="px-3 py-3">
                      <span className="block font-semibold tabular-nums text-slate-100">{usd(total)}</span>
                      {o && <span className="block text-xs text-slate-300">owed: {m.money(o.balance, o.source.currency)}</span>}
                    </td>
                  );
                })}
                <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-100">{usd(matrix.usd)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Section>
  );
};

/** A month's payments (this month first), one card per app, with the month picker and the CSV download. */
const PaidByApp: React.FC<{ m: Money; onOpenHistory: () => void }> = ({ m, onOpenHistory }) => {
  const downloadCsv = useMonthCsv();
  const thisMonth = m.today.slice(0, 7);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => shiftMonth(thisMonth, -i)), [thisMonth]);
  const [month, setMonth] = useState(thisMonth);
  const s = useMemo(
    () => summarizeMonth({ payments: m.payments, services: m.services, products: m.products, sources: m.paymentSources, etbPerUsd: m.rate }, month),
    [m.payments, m.services, m.products, m.paymentSources, m.rate, month]
  );
  const apps = useMemo(() => paymentsByApp(m.payments, m.services, m.products, month, m.rate), [m.payments, m.services, m.products, month, m.rate]);
  const name = monthName(month);

  return (
    <section aria-labelledby="paid-by-app-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="paid-by-app-heading" className="text-xl font-bold text-slate-100">
          Paid in {name}, by app
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <SelectChip
            label="Month"
            value={month}
            onChange={setMonth}
            options={months.map((x) => ({ value: x, label: `${monthName(x)}${x === thisMonth ? ' (so far)' : ''}` }))}
          />
          {s.count > 0 && (
            <button type="button" onClick={() => downloadCsv(month)} className={btnSmall}>
              <Download className="w-3.5 h-3.5" aria-hidden="true" /> Download CSV
            </button>
          )}
          <button type="button" onClick={onOpenHistory} className={`min-h-[32px] px-1 ${linkCls}`}>
            Full payment history
          </button>
        </div>
      </div>

      {s.count === 0 ? (
        <p className="text-sm text-slate-400">No payments recorded in {name}.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            <p className="text-sm text-slate-300">
              <span className="text-lg font-semibold tabular-nums text-slate-100">{usd(s.totalUsd)}</span> · {monthLine(s, { inProgress: month === thisMonth })}
            </p>
            <MonthFacts s={s} />
          </div>
          <div className="flex flex-wrap gap-4 items-start">
            {apps.map((g) => {
              const headingId = `paid-app-${g.key || 'none'}`;
              return (
                <section
                  key={g.key || 'none'}
                  aria-labelledby={headingId}
                  className="flex-[1_1_280px] min-w-0 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden"
                >
                  <h3 id={headingId} className="px-5 py-3.5 border-b border-slate-800 text-[15px] font-semibold text-slate-100">
                    {g.name} <span className="font-normal text-slate-400">· {usd(g.usd)}</span>
                  </h3>
                  <ul>
                    {g.payments.map((p) => (
                      <li
                        key={p.id}
                        className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] gap-3 items-center px-5 py-3 border-b border-slate-800 last:border-b-0"
                      >
                        <span className="text-[13px] text-slate-300 whitespace-nowrap">{shortDate(p.paidOn)}</span>
                        <TwoLine title={m.serviceName(p.serviceLinkId)} sub={`${m.sourceName(p.sourceId)} · ${ORIGIN_LABEL[p.origin]}`} />
                        <span className="text-right text-sm font-semibold tabular-nums text-slate-100 whitespace-nowrap">
                          {m.money(p.amount, p.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
};

/** Every payment, newest first (the Classic table): cost in birr and delete. Folded until opened. */
const FullHistory: React.FC<{ m: Money; open: boolean; onToggle: () => void }> = ({ m, open, onToggle }) => {
  const n = m.payments.length;
  return (
    <Section
      id={HISTORY_ID}
      title="Payment history"
      right={
        n > 0 && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={`${HISTORY_ID}-list`}
            aria-label={`${open ? 'Hide' : 'Show'} payment history`}
            className={btnSmall}
          >
            {open ? 'Hide' : 'Show'}
          </button>
        )
      }
    >
      {n === 0 ? (
        <NoPayments />
      ) : (
        <div id={`${HISTORY_ID}-list`}>
          {open ? (
            <>
              <PaymentList m={m} payments={m.visiblePayments} label="Payment history" fullDate />
              <ShowAllPayments m={m} />
            </>
          ) : (
            <p className="px-5 py-4 text-sm text-slate-400">
              {n} payment{n === 1 ? '' : 's'}, the latest on {dayLabel(m.payments[0].paidOn, m.today)}. Open it to set the cost in birr or delete a
              payment.
            </p>
          )}
        </div>
      )}
    </Section>
  );
};
