import React, { useState } from 'react';
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
import { useTheme } from '../../context/ThemeContext';
import { Currency } from '../../types';
import { formatDate } from '../../utils/formatters';
import { NumberField } from '../common/NumberField';

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
    resetToSampleSeedData,
    isDemoMode,
  } = useWorkspace();

  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  // A one-time code the user sends to the bot as "/start <code>" to link this workspace.
  const connectTelegram = () => {
    const code =
      notificationSettings.telegramVerificationCode ||
      'ST-' + crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
    updateNotificationSettings({ telegramVerificationCode: code, telegramEnabled: true });
    setTelegramEnabled(true);
    if (botUsername) window.open(`https://t.me/${botUsername}?start=${code}`, '_blank', 'noopener');
  };

  const [name, setName] = useState(currentWorkspace.name);
  const [baseCurrency, setBaseCurrency] = useState<Currency>(currentWorkspace.baseCurrency);
  const [etbRate, setEtbRate] = useState<number>(currentWorkspace.exchangeRates?.ETB_per_USD || 130);
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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    updateWorkspace({
      name: name.trim() || currentWorkspace.name,
      baseCurrency,
      timezone,
      vaultBaseUrl: vaultBaseUrl.trim(),
      exchangeRates: {
        ETB_per_USD: etbRate,
        updatedAt: new Date().toISOString(),
      },
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
        ETB_per_USD: etbRate,
        updatedAt: new Date().toISOString(),
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
              <span>Workspace Profile & Plan Limit</span>
            </h3>
            <span className="text-xs text-slate-400">
              Usage: <strong className="text-slate-200">{products.length}</strong> / {currentWorkspace.plan === 'free' ? '5 free products' : 'Unlimited'}
            </span>
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
                <option value="Africa/Nairobi">Africa/Nairobi (EAT, UTC+3)</option>
                <option value="UTC">UTC (Universal Coordinated Time)</option>
                <option value="America/New_York">America/New_York (US Eastern)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (US Pacific)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST, UTC+4)</option>
              </select>
            </div>
          </div>

          {/* Usage limit bar */}
          <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-750 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div>
              <span className="font-semibold text-slate-200">Free Tier Limit: 5 SaaS Products</span>
              <p className="text-[11px] text-slate-400">
                You have {5 - products.length > 0 ? `${5 - products.length} slots remaining` : 'reached the free tier limit'}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => alert('Billing and Stripe Checkout integration placeholder. Free tier active.')}
              className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold self-start sm:self-auto transition-colors"
            >
              Upgrade to Pro (Placeholder)
            </button>
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
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                ETB per 1 USD (Manual Exchange Rate)
              </label>
              <div className="flex items-center gap-2">
                <NumberField
                  step="0.5"
                  min="1"
                  value={etbRate}
                  onValueChange={setEtbRate}
                  fallback={130}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 font-mono"
                />
                <button
                  type="button"
                  onClick={refreshRateToday}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold shrink-0"
                  title="Update timestamp to today"
                >
                  Mark Fresh
                </button>
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Last updated:{' '}
                <strong className={isRateStale ? 'text-amber-400' : 'text-slate-300'}>
                  {formatDate(currentWorkspace.exchangeRates.updatedAt)}
                </strong>
                {isRateStale && ' (older than 30 days - please review)'}
              </span>
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
            Reminders are scheduled for each lead day and deduplicated via reminderLog.
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            {[45, 30, 14, 7, 3, 1].map((day) => {
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
                  {day} days prior
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

        {/* Notifications & Channels */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Send className="w-4 h-4 text-sky-400" />
              <span>Notification Channels</span>
            </h3>
            <button
              type="button"
              onClick={onOpenTelegramModal}
              className="text-xs font-semibold text-sky-400 hover:text-sky-300"
            >
              Test Telegram Bot →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Daily Digest Dispatch Time (Local {timezone})
              </label>
              <input
                type="time"
                value={digestTime}
                onChange={(e) => setDigestTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-1 text-xs">
            <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => setEmailEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 bg-slate-800 border-slate-700"
              />
              <span>Enable Email Delivery</span>
            </label>

            <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={telegramEnabled}
                onChange={(e) => setTelegramEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 bg-slate-800 border-slate-700"
              />
              <span>Enable Telegram Bot Alerts</span>
            </label>
          </div>
        </div>

        {/* Telegram linking (live mode only) */}
        {!isDemoMode && (
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-slate-100">Telegram Bot</h3>
            {notificationSettings.telegramChatId ? (
              <p className="text-xs text-emerald-400">
                Connected (chat {notificationSettings.telegramChatId}). Reminders will arrive in Telegram.
              </p>
            ) : (
              <p className="text-xs text-slate-400">
                Link a Telegram chat to receive reminders and use <code>/due</code>, <code>/week</code> and{' '}
                <code>/snooze</code>.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={connectTelegram}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
              >
                {notificationSettings.telegramChatId ? 'Re-link Telegram' : 'Connect Telegram'}
              </button>
              {notificationSettings.telegramVerificationCode && !notificationSettings.telegramChatId && (
                <span className="text-xs text-slate-400">
                  {botUsername ? (
                    <>Or send <code className="text-indigo-300">/start {notificationSettings.telegramVerificationCode}</code> to @{botUsername}</>
                  ) : (
                    <>Send <code className="text-indigo-300">/start {notificationSettings.telegramVerificationCode}</code> to your bot</>
                  )}
                </span>
              )}
            </div>
          </div>
        )}

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
