import React from 'react';
import { ORIGIN_LABEL } from '../../utils/reports';
import { Plus, Pencil, Trash2, AlertTriangle, CalendarClock, Receipt, FileText } from 'lucide-react';
import { NumberField } from '../common/NumberField';
import { relativeDays } from '../../utils/summary';
import { MonthlySummaryCard } from './MonthlySummaryCard';
import { MoneyModals } from './MoneyModals';
import { KIND_ICON, TX_LABEL, useMoney } from './useMoney';

const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold';

/** Cards & Payments: who pays for what, balances, top-ups, what you owe, payment history. */
export const MoneyView: React.FC<{ onOpenReceipts?: () => void }> = ({ onOpenReceipts }) => {
  const m = useMoney();
  const { payments, rate, views, alerts, unassigned, toReview, paymentSources, serviceName, sourceName, money, dual, remove, removePayment, removeTx } = m;
  const { setEditing, setTx, setRecording, showAllPayments, setShowAllPayments } = m;

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-stone-900 dark:text-slate-100">Cards & Payments</h1>
          <p className="text-xs text-stone-500 dark:text-slate-400 mt-1">
            Who pays for what, card balances, top-ups, what you owe, and every payment made.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onOpenReceipts && (
            <button type="button" onClick={onOpenReceipts} className={`${btn} bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200`}>
              <FileText className="w-3.5 h-3.5" /> Receipts
              {toReview > 0 && <span className="ml-0.5 px-1.5 rounded-full bg-rose-600 text-white text-[10px]">{toReview}</span>}
            </button>
          )}
          <button type="button" onClick={() => setRecording(true)} className={`${btn} bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200`}>
            <Receipt className="w-3.5 h-3.5" /> Record payment
          </button>
          <button type="button" onClick={() => setEditing('new')} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>
            <Plus className="w-3.5 h-3.5" /> Add card or person
          </button>
        </div>
      </div>

      {alerts.length > 0 && (
        <ul className="space-y-2" aria-label="Money alerts">
          {alerts.map((a, i) => (
            <li
              key={i}
              className={`flex gap-2 p-3 rounded-xl border text-xs ${
                a.tone === 'danger' ? 'bg-rose-500/10 border-rose-500/30 text-rose-200' : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {a.text}
            </li>
          ))}
        </ul>
      )}

      {views.length === 0 ? (
        <div className="p-6 rounded-2xl border border-dashed border-slate-700 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-200">No cards or people yet</p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Add your virtual dollar card(s) and the friend who pays for you. Then pick them as "Paid with" on each
            service to see balances, top-up needs and what you owe.
          </p>
          <button type="button" onClick={() => setEditing('new')} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>
            <Plus className="w-3.5 h-3.5" /> Add card or person
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {views.map((v) => {
            const Icon = KIND_ICON[v.source.kind];
            const total = v.charges.reduce((sum, c) => sum + c.amount, 0);
            return (
              <article key={v.source.id} className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 space-y-3" aria-label={v.source.name}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-stone-900 dark:text-slate-100 truncate">{v.source.name}</h2>
                      <p className="text-[11px] text-slate-500">
                        {[
                          v.source.last4 && `•••• ${v.source.last4}`,
                          v.source.currency,
                          v.source.expiresOn && `expires ${v.source.expiresOn.slice(5, 7)}/${v.source.expiresOn.slice(0, 4)}`,
                          `${v.serviceCount} service${v.serviceCount === 1 ? '' : 's'}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => setEditing(v.source)} className="p-1.5 text-slate-400 hover:text-slate-200" aria-label={`Edit ${v.source.name}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => remove(v.source)} className="p-1.5 text-slate-400 hover:text-rose-300" aria-label={`Delete ${v.source.name}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {v.source.kind === 'person' ? (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">You owe</p>
                    <p className="text-2xl font-extrabold font-mono text-stone-900 dark:text-slate-100">{money(Math.max(0, v.balance), v.source.currency)}</p>
                    {v.balance > 0 && v.source.currency === 'USD' && <p className="text-[11px] text-slate-500">≈ {money(Math.round(v.balance * rate), 'ETB')}</p>}
                  </div>
                ) : v.source.prepaid ? (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Balance</p>
                    <p className={`text-2xl font-extrabold font-mono ${v.balance < 0 ? 'text-rose-400' : 'text-stone-900 dark:text-slate-100'}`}>{money(v.balance, v.source.currency)}</p>
                    <p className="text-[11px] text-slate-500">After the next 30 days: {money(v.plan.balanceAfter, v.source.currency)}</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Next 30 days</p>
                    <p className="text-2xl font-extrabold font-mono text-stone-900 dark:text-slate-100">{money(total, v.source.currency)}</p>
                  </div>
                )}

                {v.plan.needed > 0 && (
                  <p className="text-xs p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200">
                    Top up <b>{dual(v.plan.needed, v.source.currency)}</b> before {v.plan.by}
                  </p>
                )}

                <div>
                  <p className="text-[11px] font-semibold text-slate-400 flex items-center gap-1 mb-1">
                    <CalendarClock className="w-3 h-3" /> Charges in the next 30 days
                  </p>
                  {v.charges.length === 0 ? (
                    <p className="text-[11px] text-slate-500">None.</p>
                  ) : (
                    <ul className="text-xs divide-y divide-slate-800">
                      {v.charges.map((c) => (
                        <li key={c.serviceId + c.date} className="flex justify-between gap-2 py-1">
                          <span className="text-slate-300 truncate">
                            {c.name} <span className="text-slate-500">· {relativeDays(c.daysDiff)}</span>
                          </span>
                          <span className="font-mono text-slate-200 shrink-0">{money(c.amount, v.source.currency)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {(() => {
                  const recent = m.recentTx(v.source.id);
                  if (!recent.length) return null;
                  return (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Recent top-ups &amp; repayments</p>
                      <ul className="text-xs divide-y divide-slate-800">
                        {recent.map((t) => (
                          <li key={t.id} className="flex items-center justify-between gap-2 py-1">
                            <span className="text-slate-300 truncate">
                              {TX_LABEL[t.kind]} <span className="text-slate-500">· {t.happenedOn}</span>
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0">
                              <span className="font-mono text-slate-200">{money(t.amount, v.source.currency)}</span>
                              <button
                                type="button"
                                onClick={() => removeTx(t, v.source.currency)}
                                aria-label={`Delete ${TX_LABEL[t.kind].toLowerCase()} of ${t.amount} on ${t.happenedOn}`}
                                className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}

                <div className="flex flex-wrap gap-2">
                  {v.source.prepaid && (
                    <>
                      <button type="button" onClick={() => setTx({ source: v.source, mode: 'top_up', balance: v.balance })} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>
                        Top up
                      </button>
                      <button type="button" onClick={() => setTx({ source: v.source, mode: 'adjustment', balance: v.balance })} className={`${btn} bg-slate-800 border border-slate-700 text-slate-300`}>
                        Correct balance
                      </button>
                    </>
                  )}
                  {v.source.kind === 'person' && (
                    <button type="button" onClick={() => setTx({ source: v.source, mode: 'repayment', balance: v.balance })} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>
                      Settle up
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {unassigned.length > 0 && paymentSources.length > 0 && (
        <p className="text-xs text-slate-400">
          {unassigned.length} paid service{unassigned.length === 1 ? ' has' : 's have'} no "Paid with" yet ({unassigned.slice(0, 4).map((s) => s.providerName).join(', ')}
          {unassigned.length > 4 ? '…' : ''}). Set it when editing the service so balances and top-ups include them.
        </p>
      )}

      <MonthlySummaryCard />

      <section aria-labelledby="payments-title" className="space-y-2">
        <h2 id="payments-title" className="text-sm font-bold text-stone-900 dark:text-slate-100">Payment history</h2>
        {payments.length === 0 ? (
          <p className="text-xs text-slate-500">
            No payments yet. They're added when auto-renewals go through, when you tap ✅ Paid in Telegram or "Mark paid" in the app.
          </p>
        ) : (
          <div className="relative overflow-x-auto rounded-xl border border-slate-800">
            {/* relative (above) keeps the hidden "Delete" heading inside this scroll box, so the phone page doesn't scroll sideways */}
            <table className="w-full text-xs">
              <thead className="bg-slate-850 text-slate-400">
                <tr>
                  <th className="text-left font-semibold px-3 py-2">Date</th>
                  <th className="text-left font-semibold px-3 py-2">Service</th>
                  <th className="text-left font-semibold px-3 py-2">Paid with</th>
                  <th className="text-right font-semibold px-3 py-2">Amount</th>
                  <th className="text-right font-semibold px-3 py-2">Cost in birr</th>
                  <th className="text-left font-semibold px-3 py-2">How</th>
                  <th className="px-1 py-2"><span className="sr-only">Delete</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {m.visiblePayments.map((p) => (
                  <tr key={p.id} className="text-slate-300">
                    <td className="px-3 py-2 whitespace-nowrap font-mono">{p.paidOn}</td>
                    <td className="px-3 py-2">{serviceName(p.serviceLinkId)}</td>
                    <td className="px-3 py-2">{sourceName(p.sourceId)}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{money(p.amount, p.currency)}</td>
                    <td className="px-3 py-1 text-right">
                      <NumberField
                        aria-label={`Cost in birr for ${serviceName(p.serviceLinkId)} on ${p.paidOn}`}
                        className="w-28 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-right font-mono text-xs"
                        step="1"
                        min="0"
                        emptyWhenZero
                        placeholder={m.birrPlaceholder(p)}
                        value={p.etbPaid ?? 0}
                        onValueChange={(n) => m.setBirr(p, n)}
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{ORIGIN_LABEL[p.origin]}</td>
                    <td className="px-1 py-1 text-right">
                      <button
                        type="button"
                        onClick={() => removePayment(p)}
                        aria-label={`Delete payment for ${serviceName(p.serviceLinkId)} on ${p.paidOn}`}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payments.length > 50 && (
              <button
                type="button"
                onClick={() => setShowAllPayments((v) => !v)}
                className="w-full px-3 py-2 text-xs font-semibold text-indigo-300 hover:bg-slate-800/60 border-t border-slate-800"
              >
                {showAllPayments ? 'Show the latest 50' : `Show all ${payments.length} payments`}
              </button>
            )}
          </div>
        )}
      </section>

      <MoneyModals m={m} />
    </div>
  );
};
