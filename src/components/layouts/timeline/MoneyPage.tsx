import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Download } from 'lucide-react';
import type { MoneyView } from '../../money/MoneyView';
import { useMoney, useMonthCsv, type Money, type SourceView } from '../../money/useMoney';
import { MoneyModals } from '../../money/MoneyModals';
import {
  BAD_TEXT,
  MoneyStats,
  MoneyToolbar,
  MonthFacts,
  NoPayments,
  NoSources,
  PaymentList,
  ShowAllPayments,
  SourceCard,
  UnassignedNote,
  WARN_TEXT,
  usd,
} from '../../money/MoneyPageParts';
import { GroupLabel, Page, PageHead, Pill, Section, TwoLine, btnSmall, btnSmallPrimary, linkCls } from '../kit';
import { chargeLedger, dayLabel, groupByMonth, monthLine, runningLabel, type LedgerLine } from '../../../utils/moneyPages';
import { monthName, summarizeMonth } from '../../../utils/monthlySummary';
import { relativeDays } from '../../../utils/summary';
import { shortDate } from '../../../utils/timeline';

/** Timeline layout: Cards & payments, in date order. What each card will be charged, then every payment by month. */
export const MoneyPage: React.FC<React.ComponentProps<typeof MoneyView>> = ({ onOpenReceipts }) => {
  const m = useMoney();
  return (
    <Page>
      <PageHead
        eyebrow="Cards & payments"
        title="Money, in date order"
        sub="What each card will be charged, when, and what is left after each charge."
        stats={<MoneyStats m={m} countCharges />}
      />
      <MoneyToolbar m={m} onOpenReceipts={onOpenReceipts} />

      {m.views.length === 0 ? (
        <NoSources m={m} />
      ) : (
        <div className="flex flex-wrap gap-6 items-start">
          <ChargeList m={m} />
          <section aria-labelledby="money-sources" className="flex-[1_1_300px] min-w-0 space-y-3">
            <GroupLabel id="money-sources">Cards and people</GroupLabel>
            {m.views.map((v) => (
              <SourceCard key={v.source.id} m={m} v={v} variant="timeline" />
            ))}
          </section>
        </div>
      )}

      <UnassignedNote m={m} />
      <History m={m} />
      <MoneyModals m={m} />
    </Page>
  );
};

/** The next 30 days for every card and person, charge by charge, with what is left after each. */
const ChargeList: React.FC<{ m: Money }> = ({ m }) => {
  // "StackTrack · usage-based" under each charge.
  const appOf = useMemo(() => {
    const product = new Map(m.products.map((p) => [p.id, p.name]));
    const service = new Map(m.services.map((s) => [s.id, s]));
    return (serviceId: string) => {
      const s = service.get(serviceId);
      if (!s) return '';
      return [product.get(s.productId), s.billingCycle === 'usage-based' && 'usage-based'].filter(Boolean).join(' · ');
    };
  }, [m.products, m.services]);

  return (
    <Section
      title="The next 30 days, charge by charge"
      right={<span className="text-xs text-slate-400">Running balance per card</span>}
      className="flex-[999_1_600px] min-w-0"
    >
      {m.views.map((v) => (
        <SourceCharges key={v.source.id} m={m} v={v} appOf={appOf} />
      ))}
    </Section>
  );
};

const SourceCharges: React.FC<{ m: Money; v: SourceView; appOf: (serviceId: string) => string }> = ({ m, v, appOf }) => {
  const { source } = v;
  const cur = source.currency;
  const lines = chargeLedger(source, v.balance, v.charges, v.plan);
  const label = runningLabel(source);
  const total = v.charges.reduce((sum, c) => sum + c.amount, 0);
  const keepsBalance = source.prepaid || source.kind === 'person';
  const headingId = `charges-${source.id}`;
  const later = v.later && `next: ${v.later.name}, ${dayLabel(v.later.date, m.today)}`;

  const status =
    source.kind === 'person'
      ? v.balance > 0.005
        ? `You owe ${m.money(v.balance, cur)} today`
        : 'Nothing owed today'
      : source.prepaid
        ? v.balance < 0
          ? `Today: ${m.money(-v.balance, cur)} short`
          : `Today: ${m.money(v.balance, cur)} left`
        : v.charges.length
          ? `${v.charges.length} charge${v.charges.length === 1 ? '' : 's'} in the next 30 days`
          : 'Nothing charged in the next 30 days';

  const right = source.prepaid ? (
    <Pill tone={v.balance < 0 ? 'bad' : v.plan.needed > 0 ? 'warn' : 'ok'}>{m.money(v.balance, cur)}</Pill>
  ) : source.kind === 'person' ? (
    <Pill tone={v.balance > 0.005 ? 'bad' : 'ok'}>{m.money(Math.max(0, v.balance), cur)}</Pill>
  ) : v.charges.length ? (
    <span className="text-sm font-semibold tabular-nums text-slate-100">{m.money(total, cur)}</span>
  ) : later ? (
    <span className="text-xs text-slate-400">{later}</span>
  ) : null;

  return (
    <section aria-labelledby={headingId} className="border-b border-slate-800 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-5 py-3 bg-slate-800/40">
        <div className="min-w-0">
          <h3 id={headingId} className="text-sm font-semibold text-slate-100">
            {source.name}
            {source.last4 ? ` ·· ${source.last4}` : ''}{' '}
            <span className="font-normal text-slate-400">
              · {[source.kind !== 'card' && source.kind, cur, source.prepaid && 'prepaid'].filter(Boolean).join(' · ')}
            </span>
          </h3>
          <p className="text-xs text-slate-300">{status}</p>
        </div>
        {right}
      </div>

      {lines.length > 0 ? (
        <ol aria-label={`Charges to ${source.name}`}>
          {lines.map((l) => (
            <LedgerRow
              key={l.kind === 'topup' ? `topup-${l.by}` : l.charge.serviceId + l.charge.date}
              m={m}
              v={v}
              l={l}
              label={label}
              appOf={appOf}
            />
          ))}
        </ol>
      ) : (
        keepsBalance && (
          <p className="flex flex-wrap justify-between gap-x-3 gap-y-1 px-5 py-3 text-sm text-slate-400 border-t border-slate-800">
            <span>Nothing charged in the next 30 days.</span>
            {later && <span>{later}</span>}
          </p>
        )
      )}
    </section>
  );
};

const LedgerRow: React.FC<{ m: Money; v: SourceView; l: LedgerLine; label: string | null; appOf: (serviceId: string) => string }> = ({
  m,
  v,
  l,
  label,
  appOf,
}) => {
  const cur = v.source.currency;
  if (l.kind === 'topup')
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-slate-800 bg-amber-500/10">
        <p className={`flex items-start gap-2 min-w-0 text-sm font-semibold ${WARN_TEXT}`}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Top up {m.dual(l.needed, cur)} before {shortDate(l.by)} ({relativeDays(l.daysLeft)})
          </span>
        </p>
        <button type="button" onClick={() => m.openTx(v, 'top_up')} className={btnSmallPrimary} aria-label={`Top up ${v.source.name}`}>
          Top up
        </button>
      </li>
    );

  const c = l.charge;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[5.5rem_minmax(0,1fr)_6.5rem_7.5rem] gap-x-3 gap-y-1 items-center px-5 py-3 border-t border-slate-800">
      <span className="col-start-1 row-start-2 sm:row-start-1 min-w-0 text-xs text-slate-400">
        <span className="sm:block sm:text-[13px] font-semibold text-slate-200">{shortDate(c.date)}</span>
        <span className="sm:hidden"> · </span>
        <span className="sm:block">{relativeDays(c.daysDiff)}</span>
      </span>
      <TwoLine className="col-start-1 row-start-1 sm:col-start-2" title={c.name} sub={appOf(c.serviceId) || undefined} />
      <span className="col-start-2 row-start-1 sm:col-start-3 text-right text-sm tabular-nums text-slate-300 whitespace-nowrap">
        −{m.money(c.amount, cur)}
      </span>
      {label && l.after !== null && (
        <span className="col-start-2 row-start-2 sm:col-start-4 sm:row-start-1 flex flex-col items-end">
          <span className="text-xs text-slate-400">{label}</span>
          <span className={`text-sm font-semibold tabular-nums ${l.tone === 'bad' ? BAD_TEXT : l.tone === 'warn' ? WARN_TEXT : 'text-slate-100'}`}>
            {m.money(l.after, cur)}
          </span>
        </span>
      )}
    </li>
  );
};

/** Every payment, grouped by month (newest first). The newest month starts open with its total and bars by app. */
const History: React.FC<{ m: Money }> = ({ m }) => {
  const downloadCsv = useMonthCsv();
  const thisMonth = m.today.slice(0, 7);
  const groups = useMemo(() => groupByMonth(m.visiblePayments), [m.visiblePayments]);
  const summaries = useMemo(() => {
    const input = { payments: m.payments, services: m.services, products: m.products, sources: m.paymentSources, etbPerUsd: m.rate };
    return new Map(groups.map((g) => [g.month, summarizeMonth(input, g.month)]));
  }, [groups, m.payments, m.services, m.products, m.paymentSources, m.rate]);
  // Months opened or closed by hand; otherwise only the newest is open.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  return (
    <Section
      id="payment-history"
      title="Payment history, by month"
      right={<span className="text-xs text-slate-400">Cost in birr is editable per payment</span>}
    >
      {m.payments.length === 0 ? (
        <NoPayments />
      ) : (
        <>
          <div>
            {groups.map((g, i) => {
              const s = summaries.get(g.month)!;
              const open = toggled[g.month] ?? i === 0;
              const name = monthName(g.month);
              const listId = `month-${g.month}`;
              return (
                <section key={g.month} aria-labelledby={`${listId}-heading`} className="border-b border-slate-800 last:border-b-0">
                  <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 bg-slate-800/40">
                    <div className="min-w-0 flex-[1_1_320px] space-y-3">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h3 id={`${listId}-heading`} className="text-[17px] font-semibold text-slate-100">
                          {name}
                          {g.month === thisMonth && <span className="font-normal text-slate-400"> (so far)</span>}
                        </h3>
                        <span className="font-semibold tabular-nums text-slate-100">{usd(s.totalUsd)}</span>
                        <span className="text-sm text-slate-300">{monthLine(s)}</span>
                      </div>
                      {open && <MonthFacts s={s} bars />}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {open && (
                        <button type="button" onClick={() => downloadCsv(g.month)} className={btnSmall} aria-label={`Download CSV of ${name}`}>
                          <Download className="w-3.5 h-3.5" aria-hidden="true" /> Download CSV
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setToggled((t) => ({ ...t, [g.month]: !open }))}
                        aria-expanded={open}
                        aria-controls={listId}
                        aria-label={`${open ? 'Hide' : 'Show'} the payments of ${name}`}
                        className={`inline-flex items-center gap-1 min-h-[32px] ${linkCls}`}
                      >
                        {open ? 'Hide' : 'Show'}
                        {open ? <ChevronDown className="w-4 h-4" aria-hidden="true" /> : <ChevronRight className="w-4 h-4" aria-hidden="true" />}
                      </button>
                    </div>
                  </div>
                  <div id={listId} hidden={!open}>
                    {open && <PaymentList m={m} payments={g.payments} label={`Payments in ${name}`} />}
                  </div>
                </section>
              );
            })}
          </div>
          <ShowAllPayments m={m} />
        </>
      )}
    </Section>
  );
};
