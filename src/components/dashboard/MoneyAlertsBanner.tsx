import React, { useMemo } from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { computeMoneyAlerts } from '../../utils/moneyAlerts';

/** Top-ups needed, expiring cards and money owed, shown on the dashboard (same rules as Telegram). */
export const MoneyAlertsBanner: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const { paymentSources, services, payments, sourceTransactions, currentWorkspace } = useWorkspace();
  const alerts = useMemo(
    () =>
      computeMoneyAlerts({
        sources: paymentSources,
        services,
        payments,
        transactions: sourceTransactions,
        etbPerUsd: currentWorkspace.exchangeRates?.ETB_per_USD || 155,
        today: new Date().toLocaleDateString('en-CA'),
      }),
    [paymentSources, services, payments, sourceTransactions, currentWorkspace.exchangeRates?.ETB_per_USD]
  );
  if (!alerts.length) return null;
  const danger = alerts.some((a) => a.severity === 'danger');

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full text-left p-3 rounded-2xl border flex gap-3 items-start transition-colors ${
        danger ? 'bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/15' : 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/15'
      }`}
      aria-label="Money alerts: open Cards & Payments"
    >
      <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${danger ? 'text-rose-400' : 'text-amber-400'}`} />
      <ul className="flex-1 min-w-0 space-y-1 text-xs text-stone-800 dark:text-slate-200">
        {alerts.slice(0, 3).map((a) => (
          <li key={a.itemId}>{a.text}</li>
        ))}
        {alerts.length > 3 && <li className="text-slate-400">…and {alerts.length - 3} more</li>}
      </ul>
      <ChevronRight className="w-4 h-4 shrink-0 text-slate-400 mt-0.5" />
    </button>
  );
};
