import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Zap, ChevronRight } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { NumberField } from '../common/NumberField';
import { guessServiceDefaults } from '../../utils/serviceGuess';
import type { BillingCycle, Currency, ServiceCategory, ServiceLink } from '../../types';

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  'hosting',
  'domain registrar',
  'database',
  'email provider',
  'payment processor',
  'auth',
  'analytics',
  'error monitoring',
  'storage',
  'SMS',
  'Telegram API',
  'Google API',
  'DB API',
  'other',
];

const LAST_PRODUCT_KEY = 'stacktrack_last_quickadd_product';
const NEW_APP = '__new_app__';
const LAST_SOURCE_KEY = 'stacktrack_last_quickadd_source';

const inputCls =
  'w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500';
const labelCls = 'block text-xs font-semibold text-slate-300 mb-1';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultProductId?: string;
  /** Switch to the full form, carrying over what was typed. */
  onMoreOptions: (draft: Partial<ServiceLink>) => void;
}

/** Small "add a service" form: name, cost, cycle, renewal date, category, app. */
export const QuickAddServiceModal: React.FC<Props> = ({ isOpen, onClose, defaultProductId, onMoreOptions }) => {
  const { products, services, templates, knownProviders, addServiceLink, addProduct, paymentSources } = useWorkspace();
  const [paymentSourceId, setPaymentSourceId] = useState('');

  const [providerName, setProviderName] = useState('');
  const [cost, setCost] = useState(0);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [renewalDate, setRenewalDate] = useState('');
  const [category, setCategory] = useState<ServiceCategory>('other');
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [plan, setPlan] = useState('');
  const [productId, setProductId] = useState('');
  const [autoRenew, setAutoRenew] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Reset every time the form opens.
  useEffect(() => {
    if (!isOpen) return;
    let remembered = '';
    try {
      remembered = localStorage.getItem(LAST_PRODUCT_KEY) || '';
    } catch {
      /* storage unavailable */
    }
    const pick =
      [defaultProductId, remembered, products[0]?.id].find((id) => id && products.some((p) => p.id === id)) ||
      NEW_APP;
    setProviderName('');
    setCost(0);
    setCurrency('USD');
    setBillingCycle('monthly');
    setRenewalDate('');
    setCategory('other');
    setCategoryTouched(false);
    setPlan('');
    setProductId(pick);
    setAutoRenew(true);
    let lastSource = '';
    try {
      lastSource = localStorage.getItem(LAST_SOURCE_KEY) || '';
    } catch {
      /* storage unavailable */
    }
    setPaymentSourceId(paymentSources.some((x) => x.id === lastSource) ? lastSource : '');
    setError(null);
    setTimeout(() => nameRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const guess = useMemo(
    () => guessServiceDefaults(providerName, services, templates),
    [providerName, services, templates]
  );

  // Apply guesses to fields the user hasn't set yet.
  useEffect(() => {
    if (guess.category && !categoryTouched) setCategory(guess.category);
    if (guess.cost !== undefined && cost === 0) {
      setCost(guess.cost);
      if (guess.currency) setCurrency(guess.currency);
      if (guess.billingCycle === 'monthly' || guess.billingCycle === 'yearly') setBillingCycle(guess.billingCycle);
    }
    if (guess.plan && !plan) setPlan(guess.plan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guess]);

  if (!isOpen) return null;

  const draft = (): Partial<ServiceLink> => ({
    providerName: providerName.trim(),
    cost,
    currency,
    billingCycle,
    renewalDate: renewalDate || undefined,
    category,
    plan,
    autoRenew,
    productId: productId === NEW_APP ? undefined : productId,
    paymentSourceId: paymentSourceId || undefined,
  });

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const name = providerName.trim();
    if (!name) {
      setError('Enter the service name, for example Vercel.');
      nameRef.current?.focus();
      return;
    }

    let targetProduct = productId;
    if (targetProduct === NEW_APP) {
      targetProduct = addProduct({
        name: 'My Stack',
        description: 'Services added with Quick Add',
        status: 'live',
        tags: [],
        environments: (['dev', 'staging', 'production'] as const).map((type) => ({
          id: `env-${type}-${crypto.randomUUID().slice(0, 8)}`,
          type,
          baseUrl: '',
        })),
      });
    }

    addServiceLink({
      productId: targetProduct,
      environmentType: 'production',
      category,
      providerName: name,
      accountEmail: '',
      loginUrl: '',
      plan,
      billingCycle,
      cost,
      currency,
      renewalDate: renewalDate || undefined,
      autoRenew,
      paymentMethodLabel: '',
      paymentSourceId: paymentSourceId || undefined,
      notes: '',
      status: 'active',
      vaultRefs: [],
    });
    try {
      localStorage.setItem(LAST_PRODUCT_KEY, targetProduct);
      if (paymentSourceId) localStorage.setItem(LAST_SOURCE_KEY, paymentSourceId);
    } catch {
      /* storage unavailable */
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-title"
        className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl relative text-slate-100 my-8"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1 rounded-lg"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 id="quick-add-title" className="text-base font-bold">
              Add a service
            </h3>
            <p className="text-xs text-slate-400">Something one of your apps pays for, like Vercel hosting.</p>
          </div>
        </div>

        <form onSubmit={save} className="space-y-3.5">
          <div>
            <label htmlFor="qa-name" className={labelCls}>
              Service name *
            </label>
            <input
              id="qa-name"
              ref={nameRef}
              list="qa-providers"
              autoComplete="off"
              className={inputCls}
              placeholder="Vercel, Supabase, Namecheap…"
              value={providerName}
              onChange={(e) => {
                setProviderName(e.target.value);
                setError(null);
              }}
            />
            <datalist id="qa-providers">
              {knownProviders.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label htmlFor="qa-cost" className={labelCls}>
                Cost
              </label>
              <NumberField
                id="qa-cost"
                className={inputCls}
                step="0.01"
                min="0"
                placeholder="0"
                emptyWhenZero
                value={cost}
                onValueChange={setCost}
              />
            </div>
            <div>
              <span className={labelCls}>Currency</span>
              <div className="flex rounded-xl border border-slate-700 overflow-hidden" role="group" aria-label="Currency">
                {(['USD', 'ETB'] as Currency[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={currency === c}
                    onClick={() => setCurrency(c)}
                    className={`px-3 py-2 text-xs font-semibold ${
                      currency === c ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className={labelCls}>Billed</span>
              <div className="flex rounded-xl border border-slate-700 overflow-hidden" role="group" aria-label="Billing cycle">
                {(['monthly', 'yearly'] as BillingCycle[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={billingCycle === c}
                    onClick={() => setBillingCycle(c)}
                    className={`flex-1 px-2 py-2 text-xs font-semibold capitalize ${
                      billingCycle === c ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="qa-renewal" className={labelCls}>
                Next renewal
              </label>
              <input
                id="qa-renewal"
                type="date"
                className={inputCls}
                value={renewalDate}
                onChange={(e) => setRenewalDate(e.target.value)}
              />
            </div>
          </div>
          {!renewalDate && (
            <p className="text-[11px] text-amber-300/80 -mt-2">Add the renewal date to get reminders.</p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="qa-category" className={labelCls}>
                Category
              </label>
              <select
                id="qa-category"
                className={inputCls}
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as ServiceCategory);
                  setCategoryTouched(true);
                }}
              >
                {SERVICE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="qa-app" className={labelCls}>
                For which app
              </label>
              <select id="qa-app" className={inputCls} value={productId} onChange={(e) => setProductId(e.target.value)}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                {!products.length && <option value={NEW_APP}>My Stack (new)</option>}
              </select>
            </div>
          </div>

          {paymentSources.length > 0 && (
            <div>
              <label htmlFor="qa-paid-with" className={labelCls}>
                Paid with
              </label>
              <select id="qa-paid-with" className={inputCls} value={paymentSourceId} onChange={(e) => setPaymentSourceId(e.target.value)}>
                <option value="">(not set)</option>
                {paymentSources.filter((x) => !x.archived).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                    {x.last4 ? ` •••• ${x.last4}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRenew}
              onChange={(e) => setAutoRenew(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            Renews automatically (charged to a card)
          </label>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => onMoreOptions(draft())}
              className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-200"
            >
              More options
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                Save service
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
