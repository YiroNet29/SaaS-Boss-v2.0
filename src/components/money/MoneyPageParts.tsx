/**
 * Pieces of the Cards & Payments page shared by the Timeline and Portfolio layouts: the head numbers, the
 * alerts and buttons, a card or person, the payment rows and a month's facts. They use the layout kit's
 * look; the logic comes from useMoney.
 */
import React, { useMemo } from 'react';
import { AlertTriangle, FileText, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { NumberField } from '../common/NumberField';
import { Bar, PILL, Stat, Toolbar, TwoLine, btnPrimary, btnSecondary, btnSmall, btnSmallPrimary } from '../layouts/kit';
import { ORIGIN_LABEL } from '../../utils/reports';
import { formatCurrency } from '../../utils/formatters';
import { monthName, summarizeMonth, type MonthlySummary } from '../../utils/monthlySummary';
import { dayLabel, moneyTotals, peopleLine, recentPaid, rowsLine, sourceMeta } from '../../utils/moneyPages';
import { relativeDays } from '../../utils/summary';
import { shortDate } from '../../utils/timeline';
import { KIND_ICON, PAYMENTS_SHOWN, TX_LABEL, type Money, type SourceView } from './useMoney';
import type { Payment } from '../../types';

export const usd = (n: number) => formatCurrency(Math.round(n * 100) / 100, 'USD');
/** Text colour for money that went below zero. */
export const BAD_TEXT = 'text-rose-600 dark:text-rose-400';
export const WARN_TEXT = 'text-amber-700 dark:text-amber-400';

/** A round icon-only button (named for screen readers, with a tooltip). */
export const IconButton: React.FC<{ label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }> = ({
  label,
  onClick,
  danger,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-slate-400 hover:bg-slate-800 transition-colors ${
      danger ? 'hover:text-rose-400' : 'hover:text-slate-200'
    }`}
  >
    {children}
  </button>
);

/** The numbers in the page head: paid this month, the next 30 days, and what you owe people. */
export const MoneyStats: React.FC<{ m: Money; countCharges?: boolean }> = ({ m, countCharges }) => {
  const thisMonth = m.today.slice(0, 7);
  const paid = useMemo(
    () =>
      summarizeMonth({ payments: m.payments, services: m.services, products: m.products, sources: m.paymentSources, etbPerUsd: m.rate }, thisMonth),
    [m.payments, m.services, m.products, m.paymentSources, m.rate, thisMonth]
  );
  const t = useMemo(() => moneyTotals(m.views, m.rate), [m.views, m.rate]);
  return (
    <>
      <Stat label={`Paid in ${monthName(thisMonth).split(' ')[0]}`} value={usd(paid.totalUsd)} sub="so far" />
      <Stat
        label="Next 30 days"
        value={usd(t.next30Usd)}
        sub={countCharges ? `${t.next30Count} charge${t.next30Count === 1 ? '' : 's'}` : undefined}
      />
      {t.hasPeople && (
        <Stat
          label="You owe"
          value={t.owedUsd > 0 ? usd(t.owedUsd) : 'Nothing'}
          sub={t.owedUsd > 0 ? peopleLine(t.owedTo) : undefined}
          tone={t.owedUsd > 0 ? 'bad' : 'ok'}
        />
      )}
    </>
  );
};

/** Alerts (top-ups, expiring cards, what you owe) on the left, the page's buttons on the right. */
export const MoneyToolbar: React.FC<{ m: Money; onOpenReceipts?: () => void }> = ({ m, onOpenReceipts }) => (
  <Toolbar
    left={
      m.alerts.length > 0 && (
        <>
          <span className="text-sm text-slate-400">Alerts:</span>
          <ul aria-label="Money alerts" className="flex flex-wrap gap-2 min-w-0">
            {m.alerts.map((a, i) => (
              <li
                key={i}
                className={`inline-flex items-start gap-1.5 max-w-full px-3 py-1.5 rounded-2xl text-xs font-semibold ${PILL[a.tone === 'danger' ? 'bad' : 'warn']}`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
                <span className="min-w-0">{a.text}</span>
              </li>
            ))}
          </ul>
        </>
      )
    }
    right={
      <>
        {onOpenReceipts && (
          <button type="button" onClick={onOpenReceipts} className={btnSecondary}>
            <FileText className="w-4 h-4" aria-hidden="true" /> Receipts
            {m.toReview > 0 && <span className={`px-1.5 rounded-full text-xs font-semibold ${PILL.bad}`}>{m.toReview}</span>}
          </button>
        )}
        <button type="button" onClick={() => m.setRecording(true)} className={btnSecondary}>
          <Receipt className="w-4 h-4" aria-hidden="true" /> Record payment
        </button>
        <button type="button" onClick={() => m.setEditing('new')} className={btnPrimary}>
          <Plus className="w-4 h-4" aria-hidden="true" /> Add card or person
        </button>
      </>
    }
  />
);

/** Shown instead of the cards when there are none yet. */
export const NoSources: React.FC<{ m: Money }> = ({ m }) => (
  <section aria-labelledby="no-sources-heading" className="p-8 rounded-2xl border-2 border-dashed border-slate-700 text-center space-y-3">
    <h2 id="no-sources-heading" className="text-lg font-semibold text-slate-100">
      No cards or people yet
    </h2>
    <p className="text-sm text-slate-300 max-w-md mx-auto">
      Add your virtual dollar card(s) and the friend who pays for you. Then pick them as "Paid with" on each service to see balances, top-up needs and
      what you owe.
    </p>
    <button type="button" onClick={() => m.setEditing('new')} className={btnPrimary}>
      <Plus className="w-4 h-4" aria-hidden="true" /> Add card or person
    </button>
  </section>
);

/** Paid services that no card or person pays for yet. */
export const UnassignedNote: React.FC<{ m: Money }> = ({ m }) => {
  const n = m.unassigned.length;
  if (!n || !m.paymentSources.length) return null;
  return (
    <p className="text-sm text-slate-300">
      {n} paid service{n === 1 ? ' has' : 's have'} no "Paid with" yet (
      {m.unassigned
        .slice(0, 4)
        .map((s) => s.providerName)
        .join(', ')}
      {n > 4 ? '…' : ''}). Set it when editing the service so balances and top-ups include them.
    </p>
  );
};

/**
 * One card or person: its details, the big number for its kind (balance, what you owe, or the next 30 days),
 * recent top-ups and repayments, and its buttons. Portfolio also shows the top-up box and the charges here;
 * Timeline shows those in its charge-by-charge list instead.
 */
export const SourceCard: React.FC<{ m: Money; v: SourceView; variant: 'timeline' | 'portfolio'; className?: string }> = ({
  m,
  v,
  variant,
  className = '',
}) => {
  const { source } = v;
  const cur = source.currency;
  const Icon = KIND_ICON[source.kind];
  const total = v.charges.reduce((sum, c) => sum + c.amount, 0);
  const recent = m.recentTx(source.id);
  const paidLine = source.kind === 'person' ? recentPaid(m.payments, m.services, source.id) : '';
  const headingId = `source-${source.id}`;
  const portfolio = variant === 'portfolio';

  const big =
    source.kind === 'person'
      ? {
          label: 'You owe',
          value: m.money(Math.max(0, v.balance), cur),
          extra: v.balance > 0 && cur === 'USD' ? `≈ ${m.money(Math.round(v.balance * m.rate), 'ETB')}` : '',
        }
      : source.prepaid
        ? {
            label: 'Balance',
            value: m.money(v.balance, cur),
            bad: v.balance < 0,
            sub: `After the next 30 days: ${m.money(v.plan.balanceAfter, cur)}`,
          }
        : { label: 'Next 30 days', value: m.money(total, cur) };

  return (
    <article
      aria-labelledby={headingId}
      className={`rounded-2xl bg-slate-900 border border-slate-800 px-5 py-4 flex flex-col gap-3 min-w-0 ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <Icon className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h3 id={headingId} className="text-[15px] font-semibold text-slate-100 truncate">
              {source.name}
            </h3>
            <p className="text-xs text-slate-400">{sourceMeta(source, v.serviceCount)}</p>
          </div>
        </div>
        <div className="flex shrink-0">
          <IconButton label={`Edit ${source.name}`} onClick={() => m.setEditing(source)}>
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
          </IconButton>
          <IconButton label={`Delete ${source.name}`} onClick={() => m.remove(source)} danger>
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <div>
        <p className="text-xs text-slate-400">{big.label}</p>
        <p className={`text-2xl font-semibold tabular-nums ${'bad' in big && big.bad ? BAD_TEXT : 'text-slate-100'}`}>
          {big.value}
          {'extra' in big && big.extra && <span className="text-sm font-normal text-slate-400"> {big.extra}</span>}
        </p>
        {'sub' in big && <p className="text-xs text-slate-300">{big.sub}</p>}
      </div>

      {portfolio && v.plan.needed > 0 && v.plan.by && (
        <p className={`text-sm px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 ${WARN_TEXT}`}>
          Top up <b>{m.dual(v.plan.needed, cur)}</b> before {shortDate(v.plan.by)}
        </p>
      )}

      {paidLine && <p className="text-sm text-slate-300">{paidLine}</p>}

      {portfolio &&
        (v.charges.length > 0 ? (
          <details>
            <summary className="cursor-pointer text-sm text-slate-300 hover:text-slate-100">
              Charges in the next 30 days · {v.charges.length} · {m.money(total, cur)}
            </summary>
            <ul className="mt-1.5 text-sm divide-y divide-slate-800">
              {v.charges.map((c) => (
                <li key={c.serviceId + c.date} className="flex justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate text-slate-200">
                    {c.name}{' '}
                    <span className="text-slate-400">
                      · {shortDate(c.date)}, {relativeDays(c.daysDiff)}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-100">{m.money(c.amount, cur)}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <p className="text-sm text-slate-400">
            No charges in the next 30 days.
            {v.later && ` Next: ${v.later.name}, ${dayLabel(v.later.date, m.today)}.`}
          </p>
        ))}

      {recent.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-0.5">Recent top-ups &amp; repayments</p>
          <ul className="text-sm divide-y divide-slate-800">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-0.5">
                <span className="min-w-0 truncate text-slate-200">
                  {TX_LABEL[t.kind]} <span className="text-slate-400">· {dayLabel(t.happenedOn, m.today)}</span>
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  <span className="tabular-nums text-slate-100">{m.money(t.amount, cur)}</span>
                  <IconButton
                    label={`Delete ${TX_LABEL[t.kind].toLowerCase()} of ${t.amount} on ${t.happenedOn}`}
                    onClick={() => m.removeTx(t, cur)}
                    danger
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </IconButton>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(source.prepaid || source.kind === 'person') && (
        <div className="flex flex-wrap gap-2">
          {source.prepaid && (
            <>
              <button type="button" onClick={() => m.openTx(v, 'top_up')} className={btnSmallPrimary}>
                Top up
              </button>
              <button type="button" onClick={() => m.openTx(v, 'adjustment')} className={btnSmall}>
                Correct balance
              </button>
            </>
          )}
          {source.kind === 'person' && (
            <button type="button" onClick={() => m.openTx(v, 'repayment')} className={btnSmallPrimary}>
              Settle up
            </button>
          )}
        </div>
      )}
    </article>
  );
};

// Phones: name and amount, then "date · paid with · how" and the birr box, delete on the right.
// Wider: one row with a column each.
const PAY_GRID =
  'grid grid-cols-[minmax(0,1fr)_auto_auto] sm:grid-cols-[5.5rem_minmax(0,1.4fr)_minmax(0,1fr)_6rem_7rem_6.5rem_2rem] gap-x-3 gap-y-1.5 items-center';
const AUTO = 'sm:col-start-auto sm:row-start-auto';

/** Payments, one per row: the cost in birr can be typed in, and each can be deleted (with the same question as Classic). */
export const PaymentList: React.FC<{ m: Money; payments: Payment[]; label: string; fullDate?: boolean }> = ({ m, payments, label, fullDate }) => {
  const appOf = useMemo(() => {
    const product = new Map(m.products.map((p) => [p.id, p.name]));
    const service = new Map(m.services.map((s) => [s.id, s]));
    return (p: Payment) => {
      const s = p.serviceLinkId ? service.get(p.serviceLinkId) : undefined;
      return s ? (product.get(s.productId) ?? '') : '';
    };
  }, [m.products, m.services]);
  const day = (p: Payment) => (fullDate ? dayLabel(p.paidOn, m.today) : shortDate(p.paidOn));

  return (
    <div>
      <div aria-hidden="true" className={`hidden sm:grid ${PAY_GRID} px-5 py-2 text-xs text-slate-400 border-b border-slate-800`}>
        <span>Date</span>
        <span>Service</span>
        <span>Paid with</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Cost in birr</span>
        <span>How</span>
        <span />
      </div>
      <ul aria-label={label}>
        {payments.map((p) => {
          const name = m.serviceName(p.serviceLinkId);
          const how = ORIGIN_LABEL[p.origin];
          const paidWith = m.sourceName(p.sourceId);
          return (
            <li key={p.id} className={`${PAY_GRID} px-5 py-3 border-b border-slate-800 last:border-b-0`}>
              <span className="hidden sm:block text-[13px] text-slate-300 whitespace-nowrap">{day(p)}</span>
              <TwoLine className={`col-start-1 row-start-1 ${AUTO}`} title={name} sub={appOf(p) || undefined} />
              <span className="col-start-1 row-start-2 sm:hidden text-xs text-slate-400 truncate">{[day(p), paidWith, how].join(' · ')}</span>
              <span className="hidden sm:block text-[13px] text-slate-300 truncate">{paidWith}</span>
              <span className={`col-start-2 row-start-1 ${AUTO} text-right text-sm font-semibold tabular-nums text-slate-100 whitespace-nowrap`}>
                {m.money(p.amount, p.currency)}
              </span>
              <span className={`col-start-2 row-start-2 ${AUTO} flex justify-end`}>
                <NumberField
                  aria-label={`Cost in birr for ${name} on ${p.paidOn}`}
                  className="w-24 sm:w-full min-h-[32px] px-2 rounded-lg bg-slate-800 border border-slate-700 text-right tabular-nums text-xs text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-indigo-500"
                  step="1"
                  min="0"
                  emptyWhenZero
                  placeholder={m.birrPlaceholder(p)}
                  value={p.etbPaid ?? 0}
                  onValueChange={(n) => m.setBirr(p, n)}
                />
              </span>
              <span className="hidden sm:block text-xs text-slate-400 whitespace-nowrap">{how}</span>
              <span className={`col-start-3 row-start-1 ${AUTO} flex justify-end`}>
                <IconButton label={`Delete payment for ${name} on ${p.paidOn}`} onClick={() => m.removePayment(p)} danger>
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </IconButton>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** "Show all 120 payments" / "Show the latest 50", as on the Classic page. */
export const ShowAllPayments: React.FC<{ m: Money }> = ({ m }) =>
  m.payments.length > PAYMENTS_SHOWN ? (
    <button
      type="button"
      onClick={() => m.setShowAllPayments((v) => !v)}
      className="w-full px-5 py-3 text-sm font-semibold text-left text-indigo-400 hover:text-indigo-300 border-t border-slate-800"
    >
      {m.showAllPayments ? `Show the latest ${PAYMENTS_SHOWN}` : `Show all ${m.payments.length} payments`}
    </button>
  ) : null;

/** A month's breakdown: bars by app (optional), who paid, the biggest services, and what still needs a receipt. */
export const MonthFacts: React.FC<{ s: MonthlySummary; bars?: boolean }> = ({ s, bars }) =>
  s.count === 0 ? null : (
    <div className="space-y-1.5">
      {bars && (
        <ul aria-label={`By app in ${monthName(s.month)}`} className="flex flex-wrap gap-x-6 gap-y-3 pb-1">
          {s.byProduct.map((r) => (
            <li key={r.name} className="flex-[1_1_180px] min-w-0">
              <Bar pct={s.totalUsd ? Math.max(2, (r.usd / s.totalUsd) * 100) : 0} caption={`${r.name} ${usd(r.usd)}`} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-400">Paid with: {rowsLine(s.bySource)}</p>
      <p className="text-xs text-slate-400">Biggest: {rowsLine(s.topServices)}</p>
      {s.etbEstimated && (
        <p className="text-xs text-slate-400">Birr is what you entered as "Cost in birr", estimated at today's rate where it's missing.</p>
      )}
      {s.withoutReceipt > 0 && (
        <p className={`text-xs ${WARN_TEXT}`}>
          🧾 {s.withoutReceipt} payment{s.withoutReceipt === 1 ? ' has' : 's have'} no receipt yet. Send them to the Telegram bot or add them on the
          Receipts page.
        </p>
      )}
    </div>
  );

/** "No payments yet…", as on the Classic page. */
export const NoPayments: React.FC = () => (
  <p className="px-5 py-6 text-sm text-slate-400">
    No payments yet. They're added when auto-renewals go through, when you tap ✅ Paid in Telegram or "Mark paid" in the app.
  </p>
);
