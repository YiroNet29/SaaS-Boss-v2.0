import React, { useEffect, useState } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { vaultUrl } from '../../utils/vault';
import { useAuth } from '../../context/AuthContext';
import { isAutoRate, FALLBACK_ETB_PER_USD } from '../../utils/fx';
import { flushWrites } from '../../lib/db';
import { getSupabase } from '../../lib/supabase/client';
import { useTheme } from '../../context/ThemeContext';
import { useLock } from '../../context/LockContext';
import { reportSecurityEvent } from '../../lib/api-client';
import type { Currency } from '../../types';

/** Timezones the workspace can use (value, and how the list shows it). */
export const TIMEZONES: { value: string; label: string }[] = [
  { value: 'Africa/Addis_Ababa', label: 'Africa/Addis_Ababa (EAT, UTC+3)' },
  { value: 'Africa/Nairobi', label: 'Africa/Nairobi (EAT, UTC+3)' },
  { value: 'UTC', label: 'UTC (Universal Coordinated Time)' },
  { value: 'America/New_York', label: 'America/New_York (US Eastern)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (US Pacific)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST, UTC+4)' },
];

export type DigestMode = 'daily' | 'individual' | 'weekly';
export const DIGEST_MODES: { value: DigestMode; label: string }[] = [
  { value: 'daily', label: 'One summary message per day' },
  { value: 'individual', label: 'One message per item' },
  { value: 'weekly', label: 'One message on Mondays: the week ahead' },
];

export type TestChannel = { status: 'sent' | 'skipped' | 'error'; detail: string };
export type TestResult = { error?: string; telegram?: TestChannel; email?: TestChannel };

/**
 * Settings, shared by every layout: the form's values (name, timezone, currency, rate, lead days, email
 * backup, reminder time and style, vault address), Save, the rate buttons, the test send, theme and
 * layout (they apply at once), and resetting the demo.
 */
export function useSettingsForm() {
  const {
    currentWorkspace,
    updateWorkspace,
    notificationSettings,
    updateNotificationSettings,
    auditLogs,
    isRateStale,
    refreshExchangeRate,
    resetToSampleSeedData,
    isDemoMode,
  } = useWorkspace();

  const { theme, setTheme, layout, setLayout } = useTheme();
  const { user, signOut } = useAuth();
  const { confirmSensitive, refreshTwoFactor, enabled: lockEnabled } = useLock();
  const [name, setName] = useState(currentWorkspace.name);
  const [baseCurrency, setBaseCurrency] = useState<Currency>(currentWorkspace.baseCurrency);
  const [etbRate, setEtbRate] = useState<number>(currentWorkspace.exchangeRates?.ETB_per_USD || FALLBACK_ETB_PER_USD);
  const rateMode: 'auto' | 'manual' = isAutoRate(currentWorkspace.exchangeRates) ? 'auto' : 'manual';
  const [rateBusy, setRateBusy] = useState(false);
  const [rateMessage, setRateMessage] = useState<string | null>(null);

  // In auto mode the box mirrors the stored rate as it refreshes.
  useEffect(() => {
    if (rateMode === 'auto') setEtbRate(currentWorkspace.exchangeRates?.ETB_per_USD || FALLBACK_ETB_PER_USD);
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
  const [vaultBaseUrl, setVaultBaseUrl] = useState(vaultUrl(currentWorkspace.vaultBaseUrl));
  const [leadDays, setLeadDays] = useState<number[]>(currentWorkspace.defaultLeadDays || [30, 14, 7, 1]);
  const [customLeadInput, setCustomLeadInput] = useState('');

  // Notification state
  const [email, setEmail] = useState(notificationSettings.email);
  const [emailEnabled, setEmailEnabled] = useState(notificationSettings.emailEnabled);
  const [telegramEnabled, setTelegramEnabled] = useState(notificationSettings.telegramEnabled);
  const [digestTime, setDigestTime] = useState(notificationSettings.digestTime || '08:00');
  const [digestMode, setDigestMode] = useState<DigestMode>(notificationSettings.digestMode || 'daily');

  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Changing where reminders go is sensitive: someone else could redirect your alerts.
  const confirmDestinationChange = async () => {
    const changed = email.trim() !== (notificationSettings.email || '') && !!(email.trim() || notificationSettings.email);
    return !changed || (await confirmSensitive(`change the backup email to ${email.trim() || '(none)'}`));
  };

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

  /** Enter in the custom-days box adds the day (instead of submitting the whole settings form). */
  const customLeadKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomLead();
    }
  };

  /** The day chips: the usual ones plus any custom days, longest first. */
  const leadDayOptions = [...new Set([60, 45, 30, 14, 7, 3, 1, ...leadDays])].sort((a, b) => b - a);

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

  /** Two-factor changes: record them in the security log and re-check the 2FA state. */
  const onSecurityEvent = (type: Parameters<typeof reportSecurityEvent>[0], detail: string) => {
    reportSecurityEvent(type, detail);
    refreshTwoFactor();
  };

  /** Demo only: put the demo back to its sample data (never touches the live workspace). */
  const resetDemo = () => {
    if (confirm('Put the demo back to its 3 sample apps?')) {
      resetToSampleSeedData();
    }
  };

  return {
    currentWorkspace,
    auditLogs,
    isRateStale,
    isDemoMode,
    theme,
    setTheme,
    layout,
    setLayout,
    user,
    signOut,
    confirmSensitive,
    lockEnabled,
    onSecurityEvent,
    name,
    setName,
    baseCurrency,
    setBaseCurrency,
    etbRate,
    setEtbRate,
    rateMode,
    rateBusy,
    rateMessage,
    updateRateNow,
    changeRateMode,
    refreshRateToday,
    timezone,
    setTimezone,
    vaultBaseUrl,
    setVaultBaseUrl,
    leadDays,
    leadDayOptions,
    toggleLeadDay,
    customLeadInput,
    setCustomLeadInput,
    addCustomLead,
    customLeadKeyDown,
    email,
    setEmail,
    emailEnabled,
    setEmailEnabled,
    telegramEnabled,
    setTelegramEnabled,
    digestTime,
    setDigestTime,
    digestMode,
    setDigestMode,
    testBusy,
    testResult,
    sendTestReminder,
    savedSuccess,
    handleSave,
    resetDemo,
  };
}

export type SettingsForm = ReturnType<typeof useSettingsForm>;
