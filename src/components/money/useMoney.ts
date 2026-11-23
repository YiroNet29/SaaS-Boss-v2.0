import { useMemo, useState } from 'react';
import { CreditCard, User, Landmark, Wallet } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useSensitiveAction } from '../../context/LockContext';
import { formatCurrency } from '../../utils/formatters';
import { convert, daysUntilExpiry, planTopUp, summarizeSource, upcomingCharges, type TopUpPlan, type UpcomingCharge } from '../../utils/ledger';
import { relativeDays } from '../../utils/summary';
import { downloadFile } from '../../utils/csv';
import { monthPaymentsCsv } from '../../utils/reports';
import { monthName } from '../../utils/monthlySummary';
import { FALLBACK_ETB_PER_USD } from '../../utils/fx';
import type { Payment, PaymentSource, SourceTransaction } from '../../types';
import type { TxMode } from './MoneyForms';

export const KIND_ICON = { card: CreditCard, person: User, bank: Landmark, other: Wallet } as const;
export const TX_LABEL = { top_up: 'Top-up', repayment: 'Repayment', adjustment: 'Correction' } as const;
/** The payment history shows this many until "Show all". */
export const PAYMENTS_SHOWN = 50;

export interface SourceView {
  source: PaymentSource;
  balance: number;
  charges: UpcomingCharge[];
  plan: TopUpPlan;
  expiryDays: number | null;
  serviceCount: number;
  /** The first charge after the next 30 days, when nothing is charged before then. */
  later?: UpcomingCharge;
}

export interface MoneyAlert {
  tone: 'warn' | 'danger';
  text: string;
}

/** Downloads one month's payments as a spreadsheet (asks "Confirm it's you" like other exports). */
export function useMonthCsv() {
  const { payments, services, products, paymentSources, receipts, currentWorkspace } = useWorkspace();
  const sensitive = useSensitiveAction();
  return async (month: string) => {
    if (!(await sensitive(`download the payments of ${monthName(month)}`, { exportOf: 'Payments CSV' }))) return;
    const { csv } = monthPaymentsCsv({ month, payments, services, products, sources: paymentSources, receipts });
    const slug = currentWorkspace.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    downloadFile(csv, `stacktrack-${slug}-payments-${month}.csv`, 'text/csv');
  };
}

/**
 * Everything the Cards & Payments page knows and does, shared by the Classic, Timeline and Portfolio
 * versions: each card or person with its balance, charges and top-up plan, the alerts, the deletes (with
 * the same confirmations), and which form is open.
 */
export function useMoney() {
  const {
    paymentSources,
    payments,
    sourceTransactions,
    services,
    products,
    currentWorkspace,
    deletePaymentSource,
    updatePayment,
    deletePayment,
    deleteSourceTransaction,
    receipts,
  } = useWorkspace();
  const sensitive = useSensitiveAction();
  const rate = currentWorkspace.exchangeRates?.ETB_per_USD || FALLBACK_ETB_PER_USD;
  const today = new Date().toLocaleDateString('en-CA');
  const [editing, setEditing] = useState<PaymentSource | null | 'new'>(null);
  const [tx, setTx] = useState<{ source: PaymentSource; mode: TxMode; balance: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const [showAllPayments, setShowAllPayments] = useState(false);

  const views: SourceView[] = useMemo(
    () =>
      paymentSources
        .filter((s) => !s.archived)
        .map((source) => {
          const { balance } = summarizeSource(source, payments, sourceTransactions, rate);
          const charges = upcomingCharges(source, services, today, rate, 30);
          const plan = source.prepaid ? planTopUp(balance, charges, source.lowBalance ?? 0) : { needed: 0, balanceAfter: balance };
          return {
            source,
            balance,
            charges,
            plan,
            expiryDays: daysUntilExpiry(source, today),
            serviceCount: services.filter((x) => x.paymentSourceId === source.id && x.status !== 'cancelled').length,
            later: charges.length ? undefined : upcomingCharges(source, services, today, rate, 400)[0],
          };
        }),
    [paymentSources, payments, sourceTransactions, services, rate, today]
  );

  const unassigned = services.filter((s) => !s.paymentSourceId && s.status !== 'cancelled' && s.billingCycle !== 'free' && s.cost > 0);
  const serviceName = (id?: string) => services.find((s) => s.id === id)?.providerName ?? '(no service)';
  const sourceName = (id?: string) => paymentSources.find((s) => s.id === id)?.name ?? '(not set)';
  const money = (n: number, c: 'USD' | 'ETB') => formatCurrency(Math.round(n * 100) / 100, c);
  const dual = (n: number, c: 'USD' | 'ETB') =>
    c === 'USD' ? `${money(n, 'USD')} ≈ ${money(Math.round(n * rate), 'ETB')}` : `${money(n, 'ETB')} ≈ ${money(n / rate, 'USD')}`;

  const removePayment = (p: Payment) => {
    const what = `${money(p.amount, p.currency)} for ${serviceName(p.serviceLinkId)} on ${p.paidOn}`;
    if (
      !window.confirm(`Delete the payment of ${what}?\n\nCard balances and what you owe are recalculated. The service's renewal date isn't changed.`)
    )
      return;
    deletePayment(p.id);
  };
  const removeTx = (t: { id: string; kind: keyof typeof TX_LABEL; amount: number; happenedOn: string }, currency: 'USD' | 'ETB') => {
    if (!window.confirm(`Delete the ${TX_LABEL[t.kind].toLowerCase()} of ${money(t.amount, currency)} on ${t.happenedOn}?`)) return;
    deleteSourceTransaction(t.id);
  };
  const remove = async (s: PaymentSource) => {
    if (!window.confirm(`Delete "${s.name}"? Its payment history stays, without this name.`)) return;
    if (!(await sensitive(`delete "${s.name}"`))) return;
    deletePaymentSource(s.id);
  };

  /** The 3 latest top-ups, repayments and corrections of a card or person. */
  const recentTx = (sourceId: string): SourceTransaction[] =>
    sourceTransactions
      .filter((t) => t.sourceId === sourceId)
      .sort((a, b) => (a.happenedOn < b.happenedOn ? 1 : -1))
      .slice(0, 3);

  /** "Cost in birr" of a payment: saved as typed, cleared when 0. */
  const setBirr = (p: Payment, n: number) => updatePayment(p.id, { etbPaid: n > 0 ? n : undefined });
  const birrPlaceholder = (p: Payment) => (p.currency === 'USD' ? `≈ ${Math.round(convert(p.amount, 'USD', 'ETB', rate))}` : '');
  const openTx = (v: SourceView, mode: TxMode) => setTx({ source: v.source, mode, balance: v.balance });

  const alerts: MoneyAlert[] = views.flatMap((v) => {
    const out: MoneyAlert[] = [];
    if (v.plan.needed > 0)
      out.push({
        tone: (v.plan.daysLeft ?? 99) <= 3 ? 'danger' : 'warn',
        text: `Top up ${v.source.name} by ${dual(v.plan.needed, v.source.currency)} before ${v.plan.by} (${relativeDays(v.plan.daysLeft ?? 0)}): ${v.plan.firstShortCharge?.name} would fail.`,
      });
    if (v.expiryDays !== null && v.expiryDays <= 45)
      out.push({
        tone: v.expiryDays <= 14 ? 'danger' : 'warn',
        text:
          v.expiryDays < 0
            ? `${v.source.name} has expired; ${v.serviceCount} service(s) still use it.`
            : `${v.source.name} expires ${relativeDays(v.expiryDays)}; ${v.serviceCount} service(s) use it.`,
      });
    if (v.source.kind === 'person' && v.balance > 0.005)
      out.push({ tone: 'warn', text: `You owe ${v.source.name} ${dual(v.balance, v.source.currency)}.` });
    return out;
  });

  const toReview = receipts.filter((r) => r.status === 'needs_review' || r.status === 'failed').length;
  const visiblePayments = useMemo(() => (showAllPayments ? payments : payments.slice(0, PAYMENTS_SHOWN)), [payments, showAllPayments]);

  return {
    paymentSources,
    payments,
    services,
    products,
    rate,
    today,
    views,
    alerts,
    unassigned,
    toReview,
    visiblePayments,
    serviceName,
    sourceName,
    money,
    dual,
    remove,
    removePayment,
    removeTx,
    recentTx,
    setBirr,
    birrPlaceholder,
    openTx,
    editing,
    setEditing,
    tx,
    setTx,
    recording,
    setRecording,
    showAllPayments,
    setShowAllPayments,
  };
}

export type Money = ReturnType<typeof useMoney>;
