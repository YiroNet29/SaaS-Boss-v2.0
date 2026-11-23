/**
 * Settings fields in the Timeline / Portfolio look, used by both layouts. Each piece takes the shared
 * form (useSettingsForm), so Save, the rate buttons and the test send behave exactly as on Classic.
 */
import React from 'react';
import { CheckCircle2, PanelLeft, GitCommitHorizontal, Columns3 } from 'lucide-react';
import { THEME_OPTIONS, LAYOUT_OPTIONS, layoutOption } from '../../context/ThemeContext';
import { ThemeIcon } from '../layout/ThemeSelector';
import type { AuditLogItem, Currency } from '../../types';
import { formatDate } from '../../utils/formatters';
import { FALLBACK_ETB_PER_USD } from '../../utils/fx';
import { historyTime } from '../../utils/settingsPages';
import { NumberField } from '../common/NumberField';
import { Chip, PILL, Pill, Segmented, btnPrimary, btnSecondary, btnSmall, inputCls } from '../layouts/kit';
import { DIGEST_MODES, TIMEZONES, type DigestMode, type SettingsForm } from './useSettingsForm';

const labelCls = 'block text-xs font-semibold text-slate-300 mb-1';
const hintCls = 'block text-xs text-slate-400 mt-1';

/** "Settings Saved!" for a moment after Save (or Save rate). */
export const SavedBadge: React.FC<{ f: SettingsForm }> = ({ f }) =>
  f.savedSuccess ? (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${PILL.ok}`}>
      <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Settings Saved!
    </span>
  ) : null;

/** Workspace name and timezone. */
export const WorkspaceFields: React.FC<{ f: SettingsForm; idPrefix: string }> = ({ f, idPrefix }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <div>
      <label htmlFor={`${idPrefix}-workspace-name`} className={labelCls}>
        Workspace Name
      </label>
      <input id={`${idPrefix}-workspace-name`} type="text" required value={f.name} onChange={(e) => f.setName(e.target.value)} className={inputCls} />
    </div>
    <div>
      <label htmlFor={`${idPrefix}-timezone`} className={labelCls}>
        Timezone
      </label>
      <select id={`${idPrefix}-timezone`} value={f.timezone} onChange={(e) => f.setTimezone(e.target.value)} className={inputCls}>
        {TIMEZONES.map((tz) => (
          <option key={tz.value} value={tz.value}>
            {tz.label}
          </option>
        ))}
      </select>
    </div>
  </div>
);

/** The vault app's address. */
export const VaultField: React.FC<{ f: SettingsForm; idPrefix: string }> = ({ f, idPrefix }) => (
  <div>
    <label htmlFor={`${idPrefix}-vault`} className={labelCls}>
      Vault address
    </label>
    <input
      id={`${idPrefix}-vault`}
      type="url"
      placeholder="https://vault.yourdomain.com"
      value={f.vaultBaseUrl}
      onChange={(e) => f.setVaultBaseUrl(e.target.value)}
      className={inputCls}
    />
    <span className={hintCls}>
      The address of your vault app. A service's vault references then open{' '}
      <code className="text-indigo-300">&lt;address&gt;/vault/api-keys/&lt;item id&gt;</code>. Leave it empty if you don't use one.
    </span>
  </div>
);

/** "Rate >30d old!" when a manual rate needs a look. */
export const RateStaleBadge: React.FC<{ f: SettingsForm }> = ({ f }) => (f.isRateStale ? <Pill tone="warn">Rate &gt;30d old!</Pill> : null);

/** Base currency, ETB per 1 USD (auto or manual), Update now / Save rate. */
export const MoneyFields: React.FC<{ f: SettingsForm; idPrefix: string }> = ({ f, idPrefix }) => {
  const rates = f.currentWorkspace.exchangeRates;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-4">
        <div>
          <label htmlFor={`${idPrefix}-base-currency`} className={labelCls}>
            Base Currency
          </label>
          <select
            id={`${idPrefix}-base-currency`}
            value={f.baseCurrency}
            onChange={(e) => f.setBaseCurrency(e.target.value as Currency)}
            className={inputCls}
          >
            <option value="USD">USD - United States Dollar ($)</option>
            <option value="ETB">ETB - Ethiopian Birr (ETB)</option>
          </select>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <label htmlFor={`${idPrefix}-etb-rate`} className="text-xs font-semibold text-slate-300">
              ETB per 1 USD
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-[1_1_8rem] min-w-0">
              <NumberField
                id={`${idPrefix}-etb-rate`}
                step="0.01"
                min="1"
                value={f.etbRate}
                onValueChange={f.setEtbRate}
                fallback={rates?.ETB_per_USD || FALLBACK_ETB_PER_USD}
                disabled={f.rateMode === 'auto'}
                className={`${inputCls} font-mono disabled:opacity-70`}
              />
            </div>
            <Segmented
              label="Rate mode"
              value={f.rateMode}
              onChange={f.changeRateMode}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'manual', label: 'Manual' },
              ]}
            />
            {f.rateMode === 'auto' ? (
              <button type="button" onClick={f.updateRateNow} disabled={f.rateBusy} className={btnSmall}>
                {f.rateBusy ? 'Updating…' : 'Update now'}
              </button>
            ) : (
              <button type="button" onClick={f.refreshRateToday} className={btnSmall} title="Save this rate and mark it as checked today">
                Save rate
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-400">
        {f.rateMode === 'auto' ? (
          <>
            Updated automatically every day
            {rates?.source && (
              <>
                {' '}from{' '}
                <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="underline text-slate-300 hover:text-slate-100">
                  {rates.source}
                </a>
              </>
            )}
            {' · last '}
            <strong className="text-slate-300">{formatDate(rates.updatedAt)}</strong>
          </>
        ) : (
          <>
            Set by you · last checked{' '}
            <strong className={f.isRateStale ? 'text-amber-700 dark:text-amber-400' : 'text-slate-300'}>{formatDate(rates.updatedAt)}</strong>
            {f.isRateStale && ' (older than 30 days, please review)'}
          </>
        )}
      </p>
      {f.rateMessage && <p className="text-xs text-amber-700 dark:text-amber-400">{f.rateMessage}</p>}
    </div>
  );
};

/** The days before something is due when a reminder goes out, plus custom days. */
export const LeadDayFields: React.FC<{ f: SettingsForm; idPrefix: string }> = ({ f, idPrefix }) => (
  <div className="space-y-3">
    <p className="text-sm text-slate-300">A reminder is sent on each of these days before something is due (once per item).</p>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Reminder days">
      {f.leadDayOptions.map((day) => (
        <Chip key={day} active={f.leadDays.includes(day)} onClick={() => f.toggleLeadDay(day)}>
          {day} {day === 1 ? 'day' : 'days'} prior
        </Chip>
      ))}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <input
        id={`${idPrefix}-custom-lead`}
        type="number"
        min="1"
        placeholder="Add custom days..."
        aria-label="Add custom days"
        value={f.customLeadInput}
        onChange={(e) => f.setCustomLeadInput(e.target.value)}
        onKeyDown={f.customLeadKeyDown}
        className={`${inputCls} w-44 flex-none`}
      />
      <button type="button" onClick={f.addCustomLead} className={btnSmall}>
        + Add Lead Day
      </button>
    </div>
  </div>
);

/** Backup email (and whether to use it), reminder time and message style. */
export const EmailTimingFields: React.FC<{ f: SettingsForm; idPrefix: string; stacked?: boolean }> = ({ f, idPrefix, stacked }) => (
  <div className="space-y-4">
    <p className="text-sm text-slate-300">Email is used only when Telegram isn't linked, is off, or can't be reached.</p>
    <div className={`grid grid-cols-1 gap-4 ${stacked ? '' : 'sm:grid-cols-2'}`}>
      <div>
        <label htmlFor={`${idPrefix}-backup-email`} className={labelCls}>
          Backup email address
        </label>
        <input id={`${idPrefix}-backup-email`} type="email" value={f.email} onChange={(e) => f.setEmail(e.target.value)} className={inputCls} />
        <label className="mt-2 flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
          <input type="checkbox" checked={f.emailEnabled} onChange={(e) => f.setEmailEnabled(e.target.checked)} className="w-4 h-4 rounded" />
          Use email as backup
        </label>
      </div>
      <div className="space-y-3">
        <div>
          <label htmlFor={`${idPrefix}-digest-time`} className={labelCls}>
            Reminder time ({f.timezone})
          </label>
          <input
            id={`${idPrefix}-digest-time`}
            type="time"
            step="3600"
            value={f.digestTime}
            onChange={(e) => f.setDigestTime(e.target.value)}
            className={inputCls}
          />
          <span className={hintCls}>Sent at the start of this hour.</span>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-digest-mode`} className={labelCls}>
            Messages
          </label>
          <select id={`${idPrefix}-digest-mode`} value={f.digestMode} onChange={(e) => f.setDigestMode(e.target.value as DigestMode)} className={inputCls}>
            {DIGEST_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          {f.digestMode === 'weekly' && (
            <span className={hintCls}>
              Everything overdue or due within 7 days, plus anything whose reminder day falls that week. Money alerts and the monthly summary still come
              when they're due.
            </span>
          )}
        </div>
      </div>
    </div>
  </div>
);

/** Send test: saves the reminder settings, then sends a sample to Telegram and the backup email. */
export const TestSend: React.FC<{ f: SettingsForm }> = ({ f }) => (
  <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={f.sendTestReminder} disabled={f.isDemoMode || f.testBusy} className={btnSecondary}>
        {f.testBusy ? 'Sending…' : 'Send test'}
      </button>
      <span className="text-xs text-slate-400 min-w-0 flex-1">
        {f.isDemoMode
          ? 'Available in your live workspace.'
          : 'Saves the reminder settings above, then sends a sample to Telegram and the backup email right now.'}
      </span>
    </div>
    {f.testResult && (
      <ul className="text-sm space-y-1" aria-live="polite">
        {f.testResult.error ? (
          <li className="text-rose-600 dark:text-rose-400">{f.testResult.error}</li>
        ) : (
          (['telegram', 'email'] as const).map((ch) => {
            const r = f.testResult?.[ch];
            if (!r) return null;
            const color = r.status === 'sent' ? 'text-emerald-700 dark:text-emerald-400' : r.status === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400';
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
);

/** Theme and layout for this device. Both apply at once. */
export const LookFields: React.FC<{ f: SettingsForm }> = ({ f }) => (
  <div className="space-y-4">
    <div className="space-y-2">
      <p className="text-xs text-slate-400">Theme · how the app looks on this device</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Theme">
        {THEME_OPTIONS.map((opt) => (
          <Chip key={opt.id} active={f.theme === opt.id} onClick={() => f.setTheme(opt.id)}>
            <ThemeIcon theme={opt.id} />
            {opt.shortLabel === 'Light' ? 'Warm Light' : opt.shortLabel}
          </Chip>
        ))}
      </div>
    </div>
    <div className="space-y-2">
      <p className="text-xs text-slate-400">Layout · this device</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Layout">
        {LAYOUT_OPTIONS.map((opt) => {
          const Icon = opt.id === 'classic' ? PanelLeft : opt.id === 'timeline' ? GitCommitHorizontal : Columns3;
          return (
            <Chip key={opt.id} active={f.layout === opt.id} onClick={() => f.setLayout(opt.id)}>
              <Icon className="w-4 h-4" aria-hidden="true" />
              {opt.name}
            </Chip>
          );
        })}
      </div>
      <p className="text-xs text-slate-400">{layoutOption(f.layout).description} On this device; works with any theme.</p>
    </div>
  </div>
);

/** Signed in as … and Sign out (live workspace only). */
export const AccountRow: React.FC<{ f: SettingsForm }> = ({ f }) =>
  !f.isDemoMode && f.user ? (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-100 truncate">Signed in as {f.user.email}</span>
        <span className="block text-xs text-slate-400">Live workspace</span>
      </span>
      <button type="button" onClick={() => f.signOut()} className={btnSmall}>
        Sign out
      </button>
    </div>
  ) : null;

/** Demo only: put the demo back to its sample data. */
export const DemoResetFields: React.FC<{ f: SettingsForm }> = ({ f }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <p className="text-sm text-slate-300">
      Puts the demo back to its 3 sample apps (PharmaFlow, QuickBite POS, MiniMart ERP) with their services and dates.
    </p>
    <button type="button" onClick={f.resetDemo} className={`${btnSecondary} shrink-0`}>
      Reset Demo Data
    </button>
  </div>
);

/** The single Save button (outside the form element, tied to it by id) and its "Saved" note. */
export const SaveBar: React.FC<{ f: SettingsForm; formId: string }> = ({ f, formId }) => (
  <div className="flex flex-wrap items-center justify-end gap-3">
    <SavedBadge f={f} />
    <button type="submit" form={formId} className={btnPrimary}>
      Save Workspace Settings
    </button>
  </div>
);

/** The workspace audit log: what changed, newest first. */
export const AuditLogList: React.FC<{ logs: AuditLogItem[]; limit?: number }> = ({ logs, limit = 15 }) => {
  const now = new Date();
  if (logs.length === 0) return <p className="px-5 py-6 text-sm text-slate-400">No changes recorded yet.</p>;
  return (
    <ul>
      {logs.slice(0, limit).map((log) => (
        <li
          key={log.id}
          className="grid grid-cols-1 sm:grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 px-5 py-2.5 border-b border-slate-800 last:border-b-0 text-sm"
        >
          <time dateTime={log.timestamp} className="text-xs text-slate-400 sm:pt-0.5">
            {historyTime(log.timestamp, now)}
          </time>
          <span className="min-w-0 break-words">
            <span className="font-semibold text-slate-200 capitalize">[{log.action}]</span> <span className="text-slate-300">{log.details}</span>
          </span>
        </li>
      ))}
    </ul>
  );
};
