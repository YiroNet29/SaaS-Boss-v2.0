import React, { useState, useEffect } from 'react';
import {
  X,
  Link2,
  KeyRound,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import {
  ServiceLink,
  ServiceCategory,
  BillingCycle,
  Currency,
  EnvironmentType,
  ServiceStatus,
  VaultRef,
} from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { vaultItemUrl } from '../../utils/vault';
import { NumberField } from '../common/NumberField';
import { SecretGuardNotice } from '../vault/SecretGuardNotice';

interface ServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<ServiceLink, 'id' | 'workspaceId' | 'createdAt'>) => void;
  initialService?: ServiceLink | null;
  defaultProductId?: string;
  /** Values carried over from Quick Add when creating a new service. */
  draft?: Partial<ServiceLink> | null;
}

const CATEGORIES: ServiceCategory[] = [
  'hosting',
  'domain registrar',
  'database',
  'email provider',
  'payment processor',
  'auth',
  'analytics',
  'error monitoring',
  'Google API',
  'Telegram API',
  'DB API',
  'storage',
  'SMS',
  'other',
];

export const ServiceModal: React.FC<ServiceModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialService,
  defaultProductId,
  draft,
}) => {
  const { products, knownProviders, currentWorkspace, paymentSources } = useWorkspace();
  const [paymentSourceId, setPaymentSourceId] = useState('');

  const [productId, setProductId] = useState('');
  const [environmentType, setEnvironmentType] = useState<EnvironmentType>('production');
  const [category, setCategory] = useState<ServiceCategory>('hosting');
  const [providerName, setProviderName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [loginUrl, setLoginUrl] = useState('');
  const [plan, setPlan] = useState('');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [cost, setCost] = useState<number>(0);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [startDate, setStartDate] = useState('');
  const [renewalDate, setRenewalDate] = useState('');
  const [trialEndsAt, setTrialEndsAt] = useState('');
  const [autoRenew, setAutoRenew] = useState(true);
  const [paymentMethodLabel, setPaymentMethodLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<ServiceStatus>('active');
  const [vaultRefs, setVaultRefs] = useState<VaultRef[]>([]);

  // New Vault ref input state
  const [newVaultId, setNewVaultId] = useState('');
  const [newVaultLabel, setNewVaultLabel] = useState('');

  useEffect(() => {
    if (initialService) {
      setProductId(initialService.productId);
      setEnvironmentType(initialService.environmentType);
      setCategory(initialService.category);
      setProviderName(initialService.providerName);
      setAccountEmail(initialService.accountEmail || '');
      setLoginUrl(initialService.loginUrl || '');
      setPlan(initialService.plan || '');
      setBillingCycle(initialService.billingCycle);
      setCost(initialService.cost || 0);
      setCurrency(initialService.currency || 'USD');
      setStartDate(initialService.startDate || '');
      setRenewalDate(initialService.renewalDate || '');
      setTrialEndsAt(initialService.trialEndsAt || '');
      setAutoRenew(initialService.autoRenew ?? true);
      setPaymentMethodLabel(initialService.paymentMethodLabel || '');
      setPaymentSourceId(initialService.paymentSourceId || '');
      setNotes(initialService.notes || '');
      setStatus(initialService.status || 'active');
      setVaultRefs(initialService.vaultRefs || []);
    } else {
      const d = draft || {};
      setProductId(d.productId || defaultProductId || (products[0]?.id ?? ''));
      setEnvironmentType('production');
      setCategory(d.category || 'hosting');
      setProviderName(d.providerName || '');
      setAccountEmail('');
      setLoginUrl('');
      setPlan(d.plan || '');
      setBillingCycle(d.billingCycle || 'monthly');
      setCost(d.cost ?? 0);
      setCurrency(d.currency || 'USD');
      setStartDate('');
      setRenewalDate(d.renewalDate || '');
      setTrialEndsAt('');
      setAutoRenew(d.autoRenew ?? true);
      setPaymentMethodLabel('');
      setPaymentSourceId(d.paymentSourceId || '');
      setNotes('');
      setStatus('active');
      setVaultRefs([]);
    }
  }, [initialService, defaultProductId, draft, products, isOpen]);

  if (!isOpen) return null;

  const handleAddVaultRef = () => {
    if (!newVaultId.trim()) return;
    setVaultRefs([
      ...vaultRefs,
      {
        vaultItemId: newVaultId.trim(),
        label: newVaultLabel.trim() || newVaultId.trim(),
        environment: environmentType,
      },
    ]);
    setNewVaultId('');
    setNewVaultLabel('');
  };

  const handleRemoveVaultRef = (index: number) => {
    setVaultRefs(vaultRefs.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerName.trim() || !productId) return;

    onSubmit({
      productId,
      environmentType,
      category,
      providerName: providerName.trim(),
      accountEmail: accountEmail.trim(),
      loginUrl: loginUrl.trim(),
      plan: plan.trim() || 'Standard',
      billingCycle,
      cost: Number(cost) || 0,
      currency,
      startDate: startDate || undefined,
      renewalDate: renewalDate || undefined,
      trialEndsAt: trialEndsAt || undefined,
      autoRenew,
      paymentMethodLabel: paymentMethodLabel.trim(),
      paymentSourceId: paymentSourceId || undefined,
      notes: notes.trim(),
      status,
      vaultRefs,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl relative text-slate-100 my-8 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1 rounded-lg"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <Link2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">
              {initialService ? 'Edit Service' : 'Add Service'}
            </h3>
            <p className="text-xs text-slate-400">
              Something an app pays for, e.g. Vercel hosting. The price and renewal date go here.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row 1: Product & Environment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                SaaS Product *
              </label>
              <select
                required
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.status})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Environment *
              </label>
              <select
                value={environmentType}
                onChange={(e) => setEnvironmentType(e.target.value as EnvironmentType)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500 capitalize"
              >
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="dev">Dev</option>
              </select>
            </div>
          </div>

          {/* Row 2: Category & Provider Name with Autocomplete Suggestions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ServiceCategory)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500 capitalize"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Provider Name *
              </label>
              <input
                type="text"
                required
                list="provider-suggestions"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="e.g. Vercel, Supabase, Cloudflare, Resend"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
              />
              <datalist id="provider-suggestions">
                {knownProviders.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>

              {/* Quick suggestion chips */}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {['Vercel', 'Supabase', 'Cloudflare', 'Resend', 'Stripe', 'Neon', 'Railway', 'Sentry'].map((rec) => (
                  <button
                    key={rec}
                    type="button"
                    onClick={() => setProviderName(rec)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    +{rec}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 3: Plan, Billing Cycle, Cost, Currency */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Plan
              </label>
              <input
                type="text"
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                placeholder="Pro, Team, PayG"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Billing Cycle
              </label>
              <select
                value={billingCycle}
                onChange={(e) => setBillingCycle(e.target.value as BillingCycle)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500 capitalize"
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="usage-based">Usage-based</option>
                <option value="one-time">One-time</option>
                <option value="free">Free</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Cost
              </label>
              <NumberField
                step="0.01"
                min="0"
                value={cost}
                onValueChange={setCost}
                emptyWhenZero
                placeholder="0"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500 font-mono"
              >
                <option value="USD">USD ($)</option>
                <option value="ETB">ETB (Birr)</option>
              </select>
            </div>
          </div>

          {/* Row 4: Renewal Date, Auto-Renew, Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Renewal Date
              </label>
              <input
                type="date"
                value={renewalDate}
                onChange={(e) => setRenewalDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="svc-paid-with" className="block text-xs font-semibold text-slate-300 mb-1">
                Paid with
              </label>
              {paymentSources.length > 0 ? (
                <select
                  id="svc-paid-with"
                  value={paymentSourceId}
                  onChange={(e) => setPaymentSourceId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="">(not set)</option>
                  {paymentSources.filter((x) => !x.archived || x.id === paymentSourceId).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                      {x.last4 ? ` •••• ${x.last4}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="svc-paid-with"
                  type="text"
                  value={paymentMethodLabel}
                  onChange={(e) => setPaymentMethodLabel(e.target.value)}
                  placeholder="Add cards under Cards & Payments"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ServiceStatus)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500 capitalize"
              >
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="paused">Paused</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Auto-renew checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autoRenewCheck"
              checked={autoRenew}
              onChange={(e) => setAutoRenew(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 bg-slate-800 border-slate-700 focus:ring-0"
            />
            <label htmlFor="autoRenewCheck" className="text-xs text-slate-300 font-medium">
              Auto-renews automatically on billing cycle
            </label>
          </div>

          {/* Row 5: Account Email & Login URL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Account Email
              </label>
              <input
                type="email"
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                placeholder="owner@company.com"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Login / Console URL
              </label>
              <input
                type="url"
                value={loginUrl}
                onChange={(e) => setLoginUrl(e.target.value)}
                placeholder="https://dashboard.provider.com"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Vault References Section (Zero secrets - IDs only) */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-750 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                <span>Vault Key References (Metadata Only)</span>
              </span>
              <span className="text-[10px] text-slate-500">
                Never stores secret keys. Stored in separate Vault.
              </span>
            </div>

            {/* Existing Vault Refs */}
            {vaultRefs.map((ref, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-850 border border-slate-700 text-xs text-slate-200"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-indigo-300">{ref.label}</span>
                  <span className="text-[10px] font-mono text-slate-400">({ref.vaultItemId})</span>
                </div>
                <div className="flex items-center gap-2">
                  {vaultItemUrl(currentWorkspace.vaultBaseUrl, ref.vaultItemId) && (
                    <a
                      href={vaultItemUrl(currentWorkspace.vaultBaseUrl, ref.vaultItemId)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 hover:text-emerald-400"
                      title="Open in Vault"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveVaultRef(idx)}
                    className="p-1 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* Add Vault Ref Inputs */}
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <input
                type="text"
                value={newVaultId}
                onChange={(e) => setNewVaultId(e.target.value)}
                placeholder="Vault Item ID (e.g. vt_stripe_prod_live)"
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-850 border border-slate-700 text-xs text-slate-200"
              />
              <input
                type="text"
                value={newVaultLabel}
                onChange={(e) => setNewVaultLabel(e.target.value)}
                placeholder="Label (e.g. Live API Key)"
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-850 border border-slate-700 text-xs text-slate-200"
              />
              <button
                type="button"
                onClick={handleAddVaultRef}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-650 text-xs font-semibold text-slate-200 transition-colors"
              >
                Attach
              </button>
            </div>
          </div>

          {/* Notes field with Real-Time Secret Guardrail Scanner */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-300">
                Notes
              </label>
              <span className="text-[10px] text-slate-500">
                Secret scanner active
              </span>
            </div>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Operational details, IP whitelists, invoice reference numbers..."
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
            />

            {/* Inline Secret Guardrail Warning */}
            <SecretGuardNotice text={notes} />
          </div>

          {/* Modal Footer */}
          <div className="pt-3 flex justify-end gap-2.5 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-750 border border-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/30 transition-colors"
            >
              {initialService ? 'Save Service' : 'Add Service'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
