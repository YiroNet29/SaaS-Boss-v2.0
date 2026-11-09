import React, { useState, useEffect } from 'react';
import { X, Calendar, Search, Loader2 } from 'lucide-react';
import { ImportantDate, ImportantDateType, RecurrenceType, ImportantDateStatus, ImportantDateSource } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { SecretGuardNotice } from '../vault/SecretGuardNotice';
import { NumberField } from '../common/NumberField';
import { extractDomainFromText } from '../../utils/domainExpiry';
import { EARLY_DOMAIN_LEAD_DAYS, SSL_LEAD_DAYS, describeCheck, isCheckable, normalizeDomain, normalizeHost } from '../../utils/expiryChecks';

interface DateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<ImportantDate, 'id' | 'workspaceId' | 'createdAt'>) => void;
  initialDate?: ImportantDate | null;
  defaultProductId?: string;
}

const DATE_TYPES: ImportantDateType[] = [
  'domain expiry',
  'SSL expiry',
  'invoice due',
  'key rotation',
  'free trial end',
  'contract renewal',
  'custom',
];

export const DateModal: React.FC<DateModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialDate,
  defaultProductId,
}) => {
  const { products, currentWorkspace, lookupExpiry, isDemoMode } = useWorkspace();

  const [productId, setProductId] = useState('');
  const [type, setType] = useState<ImportantDateType>('key rotation');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrenceType>('none');
  const [customRecurrenceDays, setCustomRecurrenceDays] = useState<number>(90);
  const [leadDays, setLeadDays] = useState<number[]>(currentWorkspace.defaultLeadDays || [30, 14, 7, 1]);
  const [customLeadInput, setCustomLeadInput] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<ImportantDateStatus>('open');
  const [source, setSource] = useState<ImportantDateSource>('manual');
  // Automatic expiry check (domain and SSL dates)
  const [checkTarget, setCheckTarget] = useState('');
  const [autoCheck, setAutoCheck] = useState(false);
  const [lookup, setLookup] = useState<{ busy?: boolean; tone?: 'ok' | 'warn' | 'error'; text?: string }>({});

  useEffect(() => {
    if (initialDate) {
      setProductId(initialDate.productId || '');
      setType(initialDate.type);
      setTitle(initialDate.title);
      setDueDate(initialDate.dueDate);
      setRecurrence(initialDate.recurrence);
      setCustomRecurrenceDays(initialDate.customRecurrenceDays || 90);
      setLeadDays(initialDate.leadDays || currentWorkspace.defaultLeadDays);
      setNotes(initialDate.notes || '');
      setStatus(initialDate.status);
      setSource(initialDate.source);
      setCheckTarget(initialDate.checkTarget || '');
      setAutoCheck(Boolean(initialDate.autoCheck));
      setLookup(initialDate.lastCheck ? { tone: initialDate.lastCheck.status === 'error' ? 'error' : 'ok', text: describeCheck(initialDate.lastCheck) } : {});
    } else {
      setProductId(defaultProductId || '');
      setType('key rotation');
      setTitle('');
      setDueDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
      setRecurrence('none');
      setCustomRecurrenceDays(90);
      setLeadDays(currentWorkspace.defaultLeadDays || [30, 14, 7, 1]);
      setNotes('');
      setStatus('open');
      setSource('manual');
      setCheckTarget('');
      setAutoCheck(false);
      setLookup({});
    }
  }, [initialDate, defaultProductId, currentWorkspace, isOpen]);

  if (!isOpen) return null;

  const checkable = isCheckable({ type });
  const isSsl = type === 'SSL expiry';
  const cleanTarget = (t: string) => (isSsl ? normalizeHost(t) : normalizeDomain(t));

  const changeType = (next: ImportantDateType) => {
    setType(next);
    // New domain / SSL dates are checked automatically by default.
    if (!initialDate && isCheckable({ type: next })) {
      setAutoCheck(true);
      if (next === 'SSL expiry') setLeadDays(SSL_LEAD_DAYS);
      if (!checkTarget) {
        const guess = extractDomainFromText(title);
        if (guess) setCheckTarget(guess);
      }
    }
  };

  const runLookup = async () => {
    const target = cleanTarget(checkTarget);
    if (!target) return setLookup({ tone: 'error', text: isSsl ? 'Enter a website address, e.g. app.saasboss.io' : 'Enter a domain, e.g. saasboss.io' });
    setCheckTarget(target);
    setLookup({ busy: true });
    const res = await lookupExpiry(type, target);
    if (!res.ok || !res.check) return setLookup({ tone: 'error', text: res.error ?? 'Look-up failed.' });
    const c = res.check;
    if (c.status === 'ok' && c.expiresOn) {
      setDueDate(c.expiresOn);
      return setLookup({
        tone: c.problem ? 'warn' : 'ok',
        text: `${isSsl ? 'Certificate' : 'Registry'}: expires ${c.expiresOn}${c.by ? ` (${c.by})` : ''}. Due date filled in.${c.problem ? ` Not trusted: ${c.problem}.` : ''}`,
      });
    }
    if (c.status === 'manual') {
      setLeadDays((prev) => [...new Set([...prev, ...EARLY_DOMAIN_LEAD_DAYS])].sort((a, b) => b - a));
      return setLookup({ tone: 'warn', text: `No automatic lookup: ${c.message}. Reminders now start 60 days before.` });
    }
    setLookup({ tone: 'error', text: `Couldn't check: ${c.message}` });
  };

  const toggleLeadDay = (day: number) => {
    if (leadDays.includes(day)) {
      setLeadDays(leadDays.filter((d) => d !== day));
    } else {
      setLeadDays([...leadDays, day].sort((a, b) => b - a));
    }
  };

  const addCustomLead = () => {
    const val = parseInt(customLeadInput, 10);
    if (!isNaN(val) && val > 0 && !leadDays.includes(val)) {
      setLeadDays([...leadDays, val].sort((a, b) => b - a));
      setCustomLeadInput('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    const target = checkable && checkTarget.trim() ? cleanTarget(checkTarget) : null;
    if (checkable && autoCheck && !target) {
      setLookup({ tone: 'error', text: isSsl ? 'Enter the website to check, e.g. app.saasboss.io' : 'Enter the domain to check, e.g. saasboss.io' });
      return;
    }
    const targetChanged = (target ?? undefined) !== (initialDate?.checkTarget ?? undefined);

    onSubmit({
      productId: productId || undefined,
      type,
      title: title.trim(),
      dueDate,
      recurrence,
      customRecurrenceDays: recurrence === 'custom days' ? customRecurrenceDays : undefined,
      leadDays,
      notes: notes.trim(),
      status,
      source,
      // Check fields only for domain / SSL dates (or one that had them), so other dates save
      // even before 0004_expiry_checks.sql has been run.
      ...(checkable || initialDate?.autoCheck || initialDate?.checkTarget
        ? {
            checkTarget: target ?? undefined,
            autoCheck: checkable ? autoCheck : false,
            // A new domain/site is checked on the next run.
            ...(targetChanged ? { lastCheck: undefined, lastCheckedAt: undefined } : {}),
          }
        : {}),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl relative text-slate-100 my-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">
              {initialDate ? 'Edit Milestone / Date' : 'Add Important Due Date'}
            </h3>
            <p className="text-xs text-slate-400">
              Domain renewals, SSL expiries, key rotations, or invoice deadlines
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                if (checkable && !checkTarget) {
                  const guess = extractDomainFromText(title);
                  if (guess) setCheckTarget(guess);
                }
              }}
              placeholder="e.g. Rotate Supabase Master Password"
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Milestone Type *
              </label>
              <select
                value={type}
                onChange={(e) => changeType(e.target.value as ImportantDateType)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500 capitalize"
              >
                {DATE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Associated Product (Optional)
              </label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500"
              >
                <option value="">Global / Workspace-wide</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Due Date *
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Recurrence
              </label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as RecurrenceType)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500 capitalize"
              >
                <option value="none">None (One-time)</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly (3 months)</option>
                <option value="yearly">Yearly</option>
                <option value="custom days">Custom Interval (Days)</option>
              </select>
            </div>
          </div>

          {checkable && (
            <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-750 space-y-2">
              <label htmlFor="check-target" className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                {isSsl ? 'Website to check' : 'Domain to check'}
              </label>
              <div className="flex gap-2">
                <input
                  id="check-target"
                  type="text"
                  value={checkTarget}
                  onChange={(e) => setCheckTarget(e.target.value)}
                  placeholder={isSsl ? 'app.saasboss.io' : 'saasboss.io'}
                  autoCapitalize="none"
                  spellCheck={false}
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={runLookup}
                  disabled={lookup.busy || isDemoMode || !checkTarget.trim()}
                  title={isDemoMode ? 'Look-ups work in your live workspace' : undefined}
                  className="px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-650 text-xs font-semibold text-slate-100 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {lookup.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Look up now
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-200">
                <input type="checkbox" checked={autoCheck} onChange={(e) => setAutoCheck(e.target.checked)} className="accent-indigo-500" />
                Check automatically every day
              </label>
              <p className="text-[11px] text-slate-400">
                {isSsl
                  ? 'The certificate is read daily and the due date follows it. Certificates normally renew themselves about 30 days before, so a reminder at 14 days means renewal is stuck.'
                  : "The registry's expiry date is read daily: when you renew, the date moves by itself. Domains without a public lookup (like .et) stay manual, with earlier reminders."}
              </p>
              {isDemoMode && <p className="text-[11px] text-slate-500">Demo: look-ups and checks run in your live workspace.</p>}
              {lookup.text && (
                <p
                  role="status"
                  className={`text-[11px] ${lookup.tone === 'error' ? 'text-rose-300' : lookup.tone === 'warn' ? 'text-amber-300' : 'text-emerald-300'}`}
                >
                  {lookup.text}
                </p>
              )}
            </div>
          )}

          {recurrence === 'custom days' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Every N Days
              </label>
              <NumberField
                min="1"
                value={customRecurrenceDays}
                onValueChange={setCustomRecurrenceDays}
                fallback={30}
                integer
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100"
              />
            </div>
          )}

          {/* Lead Days Selector with Quick Chips */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-750 space-y-2">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
              Reminder Lead Days (Alert triggers N days prior)
            </span>
            <div className="flex flex-wrap gap-1.5 items-center">
              {[...new Set([60, 30, 14, 7, 3, 1, ...leadDays])].sort((a, b) => b - a).map((day) => {
                const isSelected = leadDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleLeadDay(day)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-750 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {day} {day === 1 ? 'day' : 'days'} before
                  </button>
                );
              })}
            </div>

            {/* Custom Lead Input */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="number"
                min="1"
                placeholder="Custom days..."
                value={customLeadInput}
                onChange={(e) => setCustomLeadInput(e.target.value)}
                // Enter adds the day (instead of saving the date).
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomLead();
                  }
                }}
                className="w-32 px-2.5 py-1 rounded-lg bg-slate-850 border border-slate-700 text-xs text-slate-200"
              />
              <button
                type="button"
                onClick={addCustomLead}
                className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-650 text-xs font-medium text-slate-200"
              >
                + Add Custom
              </button>
            </div>
          </div>

          {/* Notes with Secret Guardrail */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Notes & Instructions
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Important rotation steps, registrar contact, renewal ticket number..."
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
            />
            <SecretGuardNotice text={notes} />
          </div>

          <div className="pt-2 flex justify-end gap-2.5 border-t border-slate-800">
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
              {initialDate ? 'Save Milestone' : 'Add Due Date'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
