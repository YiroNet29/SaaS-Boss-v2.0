import React, { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  DollarSign,
  Calendar,
  Send,
  Mail,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Clock,
  Shield,
  KeyRound,
  History,
  Layers,
  Sparkles,
  Code,
  Moon,
  Sun,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { isAutoRate } from '../../utils/fx';
import { flushWrites } from '../../lib/db';
import { getSupabase } from '../../lib/supabase/client';
import { useTheme } from '../../context/ThemeContext';
import { Currency } from '../../types';
import { formatDate } from '../../utils/formatters';
import { NumberField } from '../common/NumberField';
import { TelegramSettingsCard } from './TelegramSettingsCard';
import { SecuritySettingsCard } from './SecuritySettingsCard';
import { AppLockSettings } from './AppLockSettings';
import { SecurityActivity } from './SecurityActivity';
import { useLock } from '../../context/LockContext';
import { reportSecurityEvent } from '../../lib/api-client';

interface SettingsViewProps {
  onOpenTelegramModal: () => void;
  onOpenVaultModal: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onOpenTelegramModal,
  onOpenVaultModal,
}) => {
  const {
    currentWorkspace,
    updateWorkspace,
    notificationSettings,
    updateNotificationSettings,
    products,
    auditLogs,
    isRateStale,
    refreshExchangeRate,
    resetToSampleSeedData,
    isDemoMode,
  } = useWorkspace();

  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const { confirmSensitive, refreshTwoFactor, enabled: lockEnabled } = useLock();
  const [name, setName] = useState(currentWorkspace.name);
  const [baseCurrency, setBaseCurrency] = useState<Currency>(currentWorkspace.baseCurrency);
  const [etbRate, setEtbRate] = useState<number>(currentWorkspace.exchangeRates?.ETB_per_USD || 155);
  const rateMode: 'auto' | 'manual' = isAutoRate(currentWorkspace.exchangeRates) ? 'auto' : 'manual';
  const [rateBusy, setRateBusy] = useState(false);
  const [rateMessage, setRateMessage] = useState<string | null>(null);

  // In auto mode the box mirrors the stored rate as it refreshes.
  useEffect(() => {
    if (rateMode === 'auto') setEtbRate(currentWorkspace.exchangeRates?.ETB_per_USD || 155);
  }, [rateMode, currentWorkspace.exchangeRates?.ETB_per_USD]);

  const updateRateNow = async () => {
    setRateBusy(true);
    setRateMessage(null);
    const res = await refreshExchangeRate();
    setRateBusy(false);
    if (!res.ok) setRateMessage(`Couldn't update the rate: ${res.error}`);
  };

  const changeRateMode = (mode: 'auto' | 'manual') => {
    if (mode === rateMode) return;
    setRateMessage(null);
    updateWorkspace({ exchangeRates: { ...currentWorkspace.exchangeRates, mode } });
    if (mode === 'auto') updateRateNow();
  };
  const [timezone, setTimezone] = useState(currentWorkspace.timezone || 'Africa/Nairobi');
  const [vaultBaseUrl, setVaultBaseUrl] = useState(currentWorkspace.vaultBaseUrl || 'https://vault.internal.net');
  const [leadDays, setLeadDays] = useState<number[]>(currentWorkspace.defaultLeadDays || [30, 14, 7, 1]);
  const [customLeadInput, setCustomLeadInput] = useState('');

  // Notification state
  const [email, setEmail] = useState(notificationSettings.email);
  const [emailEnabled, setEmailEnabled] = useState(notificationSettings.emailEnabled);
  const [telegramEnabled, setTelegramEnabled] = useState(notificationSettings.telegramEnabled);
  const [digestTime, setDigestTime] = useState(notificationSettings.digestTime || '08:00');
  const [digestMode, setDigestMode] = useState(notificationSettings.digestMode || 'daily');

  type TestChannel = { status: 'sent' | 'skipped' | 'error'; detail: string };
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ error?: string; telegram?: TestChannel; email?: TestChannel } | null>(
    null
  );

  const sendTestReminder = async () => {
    if (!(await confirmDestinationChange())) return;
    setTestBusy(true);
    setTestResult(null);
    try {
      // Save what's on screen first so the server tests the current settings.
      updateNotificationSettings({ email: email.trim(), emailEnabled, telegramEnabled, digestTime, digestMode });
      await flushWrites();
      const { data } = await getSupabase().auth.getSession();
      const res = await fetch('/api/reminders/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ workspaceId: currentWorkspace.id }),
      });
      const body = await res.json().catch(() => ({}));
      setTestResult(res.ok ? body : { error: body.error || `Request failed (HTTP ${res.status})` });
    } catch (err) {
      setTestResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setTestBusy(false);
    }
  };

  const [savedSuccess, setSavedSuccess] = useState(false);

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

  // Changing where reminders go is sensitive: someone else could redirect your alerts.
  const confirmDestinationChange = async () => {
    const changed = email.trim() !== (notificationSettings.email || '') && !!(email.trim() || notificationSettings.email);
    return !changed || (await confirmSensitive(`change the backup email to ${email.trim() || '(none)'}`));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await confirmDestinationChange())) return;

    updateWorkspace({
      name: name.trim() || currentWorkspace.name,
      baseCurrency,
      timezone,
      vaultBaseUrl: vaultBaseUrl.trim(),
      // Auto-mode rates are owned by the daily refresh; only a manual rate is saved from this form.
      ...(rateMode === 'manual'
        ? {
            exchangeRates: {
              ...currentWorkspace.exchangeRates,
              ETB_per_USD: etbRate,
              updatedAt:
                etbRate !== currentWorkspace.exchangeRates?.ETB_per_USD
                  ? new Date().toISOString()
                  : currentWorkspace.exchangeRates.updatedAt,
              mode: 'manual' as const,
            },
          }
        : {}),
      defaultLeadDays: leadDays,
    });

    updateNotificationSettings({
      email: email.trim(),
      emailEnabled,
      telegramEnabled,
      digestTime,
      digestMode,
    });

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const refreshRateToday = () => {
    updateWorkspace({
      exchangeRates: {
        ...currentWorkspace.exchangeRates,
        ETB_per_USD: etbRate,
        updatedAt: new Date().toISOString(),
        mode: 'manual',
      },
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
            <span>Workspace Settings</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
              {currentWorkspace.plan} Plan
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure multi-tenancy, exchange rates, notification channels, and Vault integration.
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4" />
            <span>Settings Saved!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Workspace Identity & Tier */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <SettingsIcon className="w-4 h-4 text-indigo-400" />
              <span>Workspace Profile</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Workspace Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500"
              >
                <option value="Africa/Addis_Ababa">Africa/Addis_Ababa (EAT, UTC+3)</option>
                <option value="Africa/Nairobi">Africa/Nairobi (EAT, UTC+3)</option>
                <option value="UTC">UTC (Universal Coordinated Time)</option>
                <option value="America/New_York">America/New_York (US Eastern)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (US Pacific)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST, UTC+4)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Currency & Exchange Rate Rules */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span>Currency & Exchange Rates (USD & ETB)</span>
            </h3>

            {isRateStale && (
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold animate-pulse">
                Rate &gt;30d old!
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Base Currency
              </label>
              <select
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value as Currency)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 font-mono"
              >
                <option value="USD">USD - United States Dollar ($)</option>
                <option value="ETB">ETB - Ethiopian Birr (ETB)</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="etb-rate" className="block text-xs font-semibold text-slate-300">
                  ETB per 1 USD
                </label>
                <div className="flex rounded-lg border border-slate-700 overflow-hidden" role="group" aria-label="Rate mode">
                  {(['auto', 'manual'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={rateMode === m}
                      onClick={() => changeRateMode(m)}
                      className={`px-2.5 py-1 text-[11px] font-semibold capitalize ${
                        rateMode === m ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <NumberField
                  id="etb-rate"
                  step="0.01"
                  min="1"
                  value={etbRate}
                  onValueChange={setEtbRate}
                  fallback={currentWorkspace.exchangeRates?.ETB_per_USD || 155}
                  disabled={rateMode === 'auto'}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 font-mono disabled:opacity-70"
                />
                {rateMode === 'auto' ? (
                  <button
                    type="button"
                    onClick={updateRateNow}
                    disabled={rateBusy}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold shrink-0 disabled:opacity-60"
                  >
                    {rateBusy ? 'Updating…' : 'Update now'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={refreshRateToday}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold shrink-0"
                    title="Save this rate and mark it as checked today"
                  >
                    Save rate
                  </button>
                )}
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                {rateMode === 'auto' ? (
                  <>
                    Updated automatically every day
                    {currentWorkspace.exchangeRates?.source && (
                      <>
                        {' '}from{' '}
                        <a
                          href="https://www.exchangerate-api.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-slate-200"
                        >
                          {currentWorkspace.exchangeRates.source}
                        </a>
                      </>
                    )}
                    {' · last '}
                    <strong className="text-slate-300">{formatDate(currentWorkspace.exchangeRates.updatedAt)}</strong>
                  </>
                ) : (
                  <>
                    Set by you · last checked{' '}
                    <strong className={isRateStale ? 'text-amber-400' : 'text-slate-300'}>
                      {formatDate(currentWorkspace.exchangeRates.updatedAt)}
                    </strong>
                    {isRateStale && ' (older than 30 days, please review)'}
                  </>
                )}
              </span>
              {rateMessage && <span className="text-[11px] mt-1 block text-amber-300">{rateMessage}</span>}
            </div>
          </div>
        </div>

        {/* Default Reminder Lead Days */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-violet-400" />
            <span>Default Reminder Lead Days</span>
          </h3>
          <p className="text-xs text-slate-400">
            A reminder is sent on each of these days before something is due (once per item).
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            {[...new Set([60, 45, 30, 14, 7, 3, 1, ...leadDays])].sort((a, b) => b - a).map((day) => {
              const isSelected = leadDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleLeadDay(day)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    isSelected
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 hover:bg-slate-750 text-slate-400 border border-slate-700'
                  }`}
                >
                  {day} {day === 1 ? 'day' : 'days'} prior
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="number"
              min="1"
              placeholder="Add custom days..."
              value={customLeadInput}
              onChange={(e) => setCustomLeadInput(e.target.value)}
              // Enter adds the day (instead of submitting the whole settings form).
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustomLead();
                }
              }}
              className="w-40 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200"
            />
            <button
              type="button"
              onClick={addCustomLead}
              className="px-3 py-1.5 rounded-xl bg-slate-750 hover:bg-slate-700 text-xs font-semibold text-slate-200"
            >
              + Add Lead Day
            </button>
          </div>
        </div>

        {/* Telegram: main reminder channel */}
        <TelegramSettingsCard
          telegramEnabled={telegramEnabled}
          setTelegramEnabled={setTelegramEnabled}
          onOpenSimulator={onOpenTelegramModal}
        />

        {/* Email backup + timing */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Mail className="w-4 h-4 text-violet-400" />
              <span>Email backup & timing</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Email is used only when Telegram isn't linked, is off, or can't be reached.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="backup-email" className="block text-xs font-semibold text-slate-300 mb-1">
                Backup email address
              </label>
              <input
                id="backup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden"
              />
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(e) => setEmailEnabled(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                Use email as backup
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="digest-time" className="block text-xs font-semibold text-slate-300 mb-1">
                  Reminder time ({timezone})
                </label>
                <input
                  id="digest-time"
                  type="time"
                  step="3600"
                  value={digestTime}
                  onChange={(e) => setDigestTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden"
                />
                <span className="text-[11px] text-slate-500">Sent at the start of this hour.</span>
              </div>
              <div>
                <label htmlFor="digest-mode" className="block text-xs font-semibold text-slate-300 mb-1">
                  Messages
                </label>
                <select
                  id="digest-mode"
                  value={digestMode}
                  onChange={(e) => setDigestMode(e.target.value as 'daily' | 'individual')}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100"
                >
                  <option value="daily">One summary message per day</option>
                  <option value="individual">One message per item</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Send a test reminder */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100">Test your reminders</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Saves the reminder settings above, then sends a sample to Telegram and the backup email right now.
              </p>
            </div>
            <button
              type="button"
              onClick={sendTestReminder}
              disabled={isDemoMode || testBusy}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shrink-0 disabled:opacity-50"
            >
              {testBusy ? 'Sending…' : 'Send test'}
            </button>
          </div>
          {isDemoMode && <p className="text-[11px] text-slate-500">Available in your live workspace.</p>}
          {testResult && (
            <ul className="text-xs space-y-1" aria-live="polite">
              {testResult.error ? (
                <li className="text-rose-400">{testResult.error}</li>
              ) : (
                (['telegram', 'email'] as const).map((ch) => {
                  const r = testResult[ch];
                  if (!r) return null;
                  const color =
                    r.status === 'sent' ? 'text-emerald-400' : r.status === 'error' ? 'text-rose-400' : 'text-slate-400';
                  const mark = r.status === 'sent' ? '✓' : r.status === 'error' ? '✗' : '–';
                  return (
                    <li key={ch} className={color}>
                      {mark} {ch === 'telegram' ? 'Telegram' : 'Email'}: {r.detail}
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>

        {/* Account (live mode only) */}
        {!isDemoMode && user && (
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-100">Account</h3>
              <p className="text-xs text-slate-400 mt-0.5">Signed in as {user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-rose-300 border border-slate-700 text-xs font-semibold"
            >
              Sign out
            </button>
          </div>
        )}

        {/* Vault Integration Setting */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-400" />
              <span>External Vault URL</span>
            </h3>
            <button
              type="button"
              onClick={onOpenVaultModal}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
            >
              Open Vault Sync →
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Deep links will open <code className="text-indigo-300">&lt;vaultBaseUrl&gt;/vault/api-keys/&lt;vaultItemId&gt;</code>.
          </p>
          <input
            type="url"
            value={vaultBaseUrl}
            onChange={(e) => setVaultBaseUrl(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden"
          />
        </div>

        {/* Theme Settings */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-100">Workspace Theme</h3>
            <p className="text-xs text-slate-400 mt-0.5">Select your preferred developer theme aesthetic</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setTheme('vscode')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                theme === 'vscode'
                  ? 'bg-sky-500/15 border-sky-500/50 text-sky-300 shadow-xs'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-750'
              }`}
            >
              <Code className="w-4 h-4 text-sky-400" />
              <span>VS Code Dark</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme('midnight')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                theme === 'midnight'
                  ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300 shadow-xs'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-750'
              }`}
            >
              <Moon className="w-4 h-4 text-indigo-400" />
              <span>Vercel Midnight</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                theme === 'light'
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-700 dark:text-amber-300 shadow-xs'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-750'
              }`}
            >
              <Sun className="w-4 h-4 text-amber-500" />
              <span>Warm Light</span>
            </button>
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-colors"
          >
            Save Workspace Settings
          </button>
        </div>
      </form>

      {/* Security: two-factor login, app lock, security log (outside the settings form: it has its own forms) */}
      <SecuritySettingsCard
        confirmSensitive={confirmSensitive}
        onSecurityEvent={(type, detail) => {
          reportSecurityEvent(type, detail);
          refreshTwoFactor();
        }}
      >
        {lockEnabled && <AppLockSettings />}
        {lockEnabled && <SecurityActivity />}
      </SecuritySettingsCard>

      {/* Audit Log Section */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" />
            <span>Workspace Audit Log</span>
          </h3>
          <span className="text-[10px] text-slate-500">{auditLogs.length} recent events</span>
        </div>

        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-800/80 border border-slate-800 rounded-xl p-2 bg-slate-850 text-xs">
          {auditLogs.slice(0, 15).map((log) => (
            <div key={log.id} className="pt-1.5 flex items-start justify-between gap-2">
              <div>
                <span className="font-semibold text-slate-300 capitalize">[{log.action}]</span>{' '}
                <span className="text-slate-400">{log.details}</span>
              </div>
              <span className="text-[10px] text-slate-500 shrink-0">
                {formatDate(log.timestamp)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Demo Reset Banner */}
      <div className="p-4 rounded-2xl bg-slate-850 border border-slate-750 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
            <span>Restore Deterministic Seed Data</span>
          </span>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Reset workspace to the 3 sample founder stacks (PharmaFlow, QuickBite POS, MiniMart ERP) with 15+ services and upcoming dates.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (confirm('Reset workspace to the initial 3 sample SaaS stacks?')) {
              resetToSampleSeedData();
            }
          }}
          className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 text-xs font-semibold shrink-0 transition-colors"
        >
          Reset Demo Data
        </button>
      </div>
    </div>
  );
};
