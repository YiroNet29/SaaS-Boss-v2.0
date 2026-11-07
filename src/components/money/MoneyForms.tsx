import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { NumberField } from '../common/NumberField';
import { endOfMonth } from '../../utils/ledger';
import { formatCurrency } from '../../utils/formatters';
import type { Currency, PaymentSource, PaymentSourceKind } from '../../types';

export const inputCls =
  'w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500';
export const labelCls = 'block text-xs font-semibold text-slate-300 mb-1';
const today = () => new Date().toLocaleDateString('en-CA');

export const Modal: React.FC<{ title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }> = ({
  title,
  subtitle,
  onClose,
  children,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl relative text-slate-100 my-8">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-base font-bold pr-8">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
};

const Footer: React.FC<{ onCancel: () => void; submitLabel: string; disabled?: boolean }> = ({ onCancel, submitLabel, disabled }) => (
  <div className="flex justify-end gap-2 pt-2">
    <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold">
      Cancel
    </button>
    <button type="submit" disabled={disabled} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50">
      {submitLabel}
    </button>
  </div>
);

const Segmented = <T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) => (
  <div className="flex rounded-xl border border-slate-700 overflow-hidden" role="group" aria-label={label}>
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        aria-pressed={value === o.value}
        onClick={() => onChange(o.value)}
        className={`flex-1 px-2 py-2 text-xs font-semibold ${value === o.value ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-750'}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

/** Add or edit a card / person / account. */
export const SourceForm: React.FC<{ source?: PaymentSource | null; onClose: () => void }> = ({ source, onClose }) => {
  const { addPaymentSource, updatePaymentSource } = useWorkspace();
  const [name, setName] = useState(source?.name ?? '');
  const [kind, setKind] = useState<PaymentSourceKind>(source?.kind ?? 'card');
  const [currency, setCurrency] = useState<Currency>(source?.currency ?? 'USD');
  const [last4, setLast4] = useState(source?.last4 ?? '');
  const [expiry, setExpiry] = useState(source?.expiresOn ? source.expiresOn.slice(0, 7) : '');
  const [prepaid, setPrepaid] = useState(source?.prepaid ?? true);
  const [balance, setBalance] = useState(source?.openingBalance ?? 0);
  const [lowBalance, setLowBalance] = useState(source?.lowBalance ?? 0);
  const [notes, setNotes] = useState(source?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give it a name, e.g. "Grey virtual card" or "Abebe (USA)".');
    if (last4 && !/^\d{4}$/.test(last4)) return setError('Last 4 digits must be exactly 4 numbers.');
    const isCard = kind === 'card';
    const data = {
      name: name.trim(),
      kind,
      currency,
      prepaid: isCard && prepaid,
      openingBalance: isCard && prepaid ? balance : 0,
      lowBalance: isCard && prepaid && lowBalance > 0 ? lowBalance : undefined,
      last4: isCard && last4 ? last4 : undefined,
      expiresOn: isCard && expiry ? endOfMonth(expiry) : undefined,
      notes: notes.trim(),
      archived: source?.archived ?? false,
    };
    if (source) {
      // The starting balance is set once; later corrections go through "Correct balance".
      const { openingBalance: _ignore, ...rest } = data;
      updatePaymentSource(source.id, rest);
    } else {
      addPaymentSource(data);
    }
    onClose();
  };

  return (
    <Modal title={source ? `Edit ${source.name}` : 'Add a card or person'} subtitle="Who or what pays for your services." onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div>
          <span className={labelCls}>Type</span>
          <Segmented
            label="Type"
            value={kind}
            onChange={(v) => setKind(v as PaymentSourceKind)}
            options={[
              { value: 'card', label: 'Card' },
              { value: 'person', label: 'Person' },
              { value: 'bank', label: 'Bank / wallet' },
            ]}
          />
        </div>
        <div>
          <label htmlFor="src-name" className={labelCls}>Name *</label>
          <input
            id="src-name"
            className={inputCls}
            autoFocus
            placeholder={kind === 'person' ? 'Abebe (USA)' : kind === 'card' ? 'Grey virtual card' : 'CBE Birr'}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className={labelCls}>Currency</span>
            <Segmented label="Currency" value={currency} onChange={(v) => setCurrency(v as Currency)} options={[{ value: 'USD', label: 'USD' }, { value: 'ETB', label: 'ETB' }]} />
          </div>
          {kind === 'card' && (
            <div>
              <label htmlFor="src-last4" className={labelCls}>Last 4 digits</label>
              <input id="src-last4" className={inputCls} inputMode="numeric" maxLength={4} placeholder="4821" value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </div>
          )}
        </div>
        {kind === 'card' && (
          <>
            <div>
              <label htmlFor="src-expiry" className={labelCls}>Expires (month)</label>
              <input id="src-expiry" type="month" className={inputCls} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" checked={prepaid} onChange={(e) => setPrepaid(e.target.checked)} className="w-4 h-4 rounded" />
              Prepaid: it has a balance I top up (most virtual dollar cards)
            </label>
            {prepaid && (
              <div className="grid grid-cols-2 gap-2">
                {!source && (
                  <div>
                    <label htmlFor="src-balance" className={labelCls}>Balance now ({currency})</label>
                    <NumberField id="src-balance" className={inputCls} step="0.01" value={balance} onValueChange={setBalance} />
                  </div>
                )}
                <div>
                  <label htmlFor="src-low" className={labelCls}>Warn below ({currency})</label>
                  <NumberField id="src-low" className={inputCls} step="0.01" min="0" emptyWhenZero placeholder="0" value={lowBalance} onValueChange={setLowBalance} />
                </div>
              </div>
            )}
          </>
        )}
        <div>
          <label htmlFor="src-notes" className={labelCls}>Notes</label>
          <input id="src-notes" className={inputCls} placeholder={kind === 'person' ? 'I pay him back monthly via Remitly' : ''} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <Footer onCancel={onClose} submitLabel={source ? 'Save' : 'Add'} />
      </form>
    </Modal>
  );
};

export type TxMode = 'top_up' | 'repayment' | 'adjustment';

/** Top up a card, record a repayment to a person, or correct a card balance. */
export const TransactionForm: React.FC<{ source: PaymentSource; mode: TxMode; currentBalance: number; onClose: () => void }> = ({
  source,
  mode,
  currentBalance,
  onClose,
}) => {
  const { addSourceTransaction, currentWorkspace } = useWorkspace();
  const rate = currentWorkspace.exchangeRates?.ETB_per_USD || 155;
  const [amount, setAmount] = useState(mode === 'repayment' ? Math.max(0, currentBalance) : 0);
  const [actual, setActual] = useState(currentBalance);
  const [etbPaid, setEtbPaid] = useState(0);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  const titles: Record<TxMode, string> = {
    top_up: `Top up ${source.name}`,
    repayment: `Settle up with ${source.name}`,
    adjustment: `Correct the balance of ${source.name}`,
  };
  const subtitles: Record<TxMode, string> = {
    top_up: `Current balance ${formatCurrency(currentBalance, source.currency)}.`,
    repayment: `You owe ${formatCurrency(Math.max(0, currentBalance), source.currency)}. Record what you paid back.`,
    adjustment: 'Enter what the card app shows right now; the difference is saved as a correction.',
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const value = mode === 'adjustment' ? Math.round((actual - currentBalance) * 100) / 100 : amount;
    if (!value) return onClose();
    addSourceTransaction({
      sourceId: source.id,
      kind: mode,
      happenedOn: date,
      amount: value,
      etbPaid: mode !== 'adjustment' && etbPaid > 0 ? etbPaid : undefined,
      note: note.trim(),
    });
    onClose();
  };

  const estimate = source.currency === 'USD' && amount > 0 ? `≈ ETB ${Math.round(amount * rate).toLocaleString('en-US')} at today's rate` : '';

  return (
    <Modal title={titles[mode]} subtitle={subtitles[mode]} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        {mode === 'adjustment' ? (
          <div>
            <label htmlFor="tx-actual" className={labelCls}>Actual balance now ({source.currency})</label>
            <NumberField id="tx-actual" className={inputCls} step="0.01" value={actual} onValueChange={setActual} autoFocus />
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="tx-amount" className={labelCls}>Amount ({source.currency})</label>
              <NumberField id="tx-amount" className={inputCls} step="0.01" min="0" emptyWhenZero placeholder="0" value={amount} onValueChange={setAmount} autoFocus />
              {estimate && <p className="text-[11px] text-slate-500 mt-1">{estimate}</p>}
            </div>
            <div>
              <label htmlFor="tx-etb" className={labelCls}>What it cost you in birr (optional, fees included)</label>
              <NumberField id="tx-etb" className={inputCls} step="1" min="0" emptyWhenZero placeholder="e.g. 15800" value={etbPaid} onValueChange={setEtbPaid} />
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="tx-date" className={labelCls}>Date</label>
            <input id="tx-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="tx-note" className={labelCls}>Note</label>
            <input id="tx-note" className={inputCls} placeholder={mode === 'repayment' ? 'Sent via Remitly' : 'Via Telebirr'} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <Footer onCancel={onClose} submitLabel={mode === 'top_up' ? 'Save top-up' : mode === 'repayment' ? 'Save repayment' : 'Save correction'} />
      </form>
    </Modal>
  );
};

/** Record a payment by hand (or for a service, with the cost filled in). */
export const PaymentForm: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { services, paymentSources, recordPayment } = useWorkspace();
  const [serviceId, setServiceId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [etbPaid, setEtbPaid] = useState(0);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  const pickService = (id: string) => {
    setServiceId(id);
    const s = services.find((x) => x.id === id);
    if (s) {
      setAmount(s.cost);
      setCurrency(s.currency);
      if (s.paymentSourceId) setSourceId(s.paymentSourceId);
    }
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;
    recordPayment({
      serviceLinkId: serviceId || undefined,
      sourceId: sourceId || undefined,
      paidOn: date,
      amount,
      currency,
      etbPaid: etbPaid > 0 ? etbPaid : undefined,
      origin: 'manual',
      note: note.trim(),
    });
    onClose();
  };

  return (
    <Modal title="Record a payment" subtitle="For one-off charges or anything paid outside a renewal." onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div>
          <label htmlFor="pay-svc" className={labelCls}>Service</label>
          <select id="pay-svc" className={inputCls} value={serviceId} onChange={(e) => pickService(e.target.value)}>
            <option value="">(none)</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.providerName}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div>
            <label htmlFor="pay-amount" className={labelCls}>Amount</label>
            <NumberField id="pay-amount" className={inputCls} step="0.01" min="0" emptyWhenZero placeholder="0" value={amount} onValueChange={setAmount} />
          </div>
          <div>
            <span className={labelCls}>Currency</span>
            <Segmented label="Currency" value={currency} onChange={(v) => setCurrency(v as Currency)} options={[{ value: 'USD', label: 'USD' }, { value: 'ETB', label: 'ETB' }]} />
          </div>
        </div>
        <div>
          <label htmlFor="pay-src" className={labelCls}>Paid with</label>
          <select id="pay-src" className={inputCls} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">(not set)</option>
            {paymentSources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="pay-date" className={labelCls}>Date</label>
            <input id="pay-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="pay-etb" className={labelCls}>Cost in birr (optional)</label>
            <NumberField id="pay-etb" className={inputCls} step="1" min="0" emptyWhenZero placeholder="e.g. 3250" value={etbPaid} onValueChange={setEtbPaid} />
          </div>
        </div>
        <div>
          <label htmlFor="pay-note" className={labelCls}>Note</label>
          <input id="pay-note" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Footer onCancel={onClose} submitLabel="Save payment" disabled={!amount} />
      </form>
    </Modal>
  );
};
