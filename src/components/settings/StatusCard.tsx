import React, { useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useJobStatus } from '../../hooks/useJobStatus';
import { ago, hourlyJobHealth, minutesSince } from '../../utils/jobStatus';

type Tone = 'ok' | 'warn' | 'bad' | 'muted';
const toneCls: Record<Tone, string> = {
  ok: 'text-emerald-400',
  warn: 'text-amber-400',
  bad: 'text-rose-400',
  muted: 'text-slate-400',
};

const Row: React.FC<{ label: string; tone: Tone; value: string; hint?: string }> = ({ label, tone, value, hint }) => (
  <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3 py-2">
    <dt className="text-xs text-slate-400 sm:w-44 shrink-0">{label}</dt>
    <dd className="text-xs">
      <span className={`font-semibold ${toneCls[tone]}`}>{value}</span>
      {hint && <span className="block text-[11px] text-slate-500 mt-0.5">{hint}</span>}
    </dd>
  </div>
);

/** Ends a message with a full stop, so the next sentence reads right. */
const sentence = (t?: string) => (t ? (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`) : '');

/** Settings → Status: is everything that runs on its own actually running? */
export const StatusCard: React.FC = () => {
  const { currentWorkspace, dates } = useWorkspace();
  const { status, missing, loaded, refresh } = useJobStatus();
  const [busy, setBusy] = useState(false);
  const now = new Date();

  const job = hourlyJobHealth(missing ? undefined : status, now);
  const jobRow: { tone: Tone; value: string; hint?: string } = !loaded
    ? { tone: 'muted', value: 'Checking…' }
    : missing
      ? { tone: 'muted', value: 'Not recorded yet', hint: 'Run supabase/migrations/0006_job_status.sql in the Supabase SQL Editor.' }
      : job.health === 'never'
        ? { tone: 'warn', value: 'Has never run', hint: 'Set up the hourly cron-job.org job (README → Setup guide, step 3). Reminders need it.' }
        : job.health === 'ok'
          ? { tone: 'ok', value: `Ran ${ago(job.minutesAgo!)}` }
          : job.health === 'late'
            ? { tone: 'warn', value: `Late: last ran ${ago(job.minutesAgo!)}`, hint: 'It should run every hour.' }
            : { tone: 'bad', value: `Stopped: last ran ${ago(job.minutesAgo!)}`, hint: 'Check the job on cron-job.org (its history shows why).' };

  const tgFailed = minutesSince(status?.telegramFailedAt, now);
  const tgOk = minutesSince(status?.telegramOkAt, now);
  const tgRow: { tone: Tone; value: string; hint?: string } =
    tgFailed !== undefined && (tgOk === undefined || tgFailed < tgOk)
      ? { tone: 'bad', value: `Last message failed ${ago(tgFailed)}`, hint: `${sentence(status?.telegramError)} Email was used instead, if it's on.`.trim() }
      : tgOk !== undefined
        ? { tone: 'ok', value: `Last message sent ${ago(tgOk)}`, hint: tgFailed !== undefined ? `Last failure ${ago(tgFailed)}: ${status?.telegramError ?? ''}` : undefined }
        : { tone: 'muted', value: 'No messages sent by the hourly job yet' };

  const rateAge = minutesSince(currentWorkspace.exchangeRates?.updatedAt, now);
  const rateAuto = currentWorkspace.exchangeRates?.mode !== 'manual';
  const rateRow: { tone: Tone; value: string; hint?: string } =
    rateAge === undefined
      ? { tone: 'muted', value: 'Never updated' }
      : { tone: rateAge > 60 * 24 * 30 ? 'bad' : rateAuto && rateAge > 60 * 24 * 2 ? 'warn' : 'ok', value: `${rateAuto ? 'Updated' : 'Set by you'} ${ago(rateAge)}` };

  const auto = dates.filter((d) => d.autoCheck && (d.type === 'domain expiry' || d.type === 'SSL expiry'));
  const lastCheck = auto.map((d) => d.lastCheckedAt).filter(Boolean).sort().pop();
  const checkAge = minutesSince(lastCheck, now);
  const checkRow: { tone: Tone; value: string; hint?: string } = !auto.length
    ? { tone: 'muted', value: 'No domain or SSL dates are checked automatically' }
    : checkAge === undefined
      ? { tone: 'warn', value: `${auto.length} date${auto.length === 1 ? '' : 's'} not checked yet`, hint: 'The hourly job checks each about once a day.' }
      : { tone: checkAge > 60 * 48 ? 'warn' : 'ok', value: `Last checked ${ago(checkAge)} (${auto.length} date${auto.length === 1 ? '' : 's'})` };

  return (
    <section aria-labelledby="status-title" className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 id="status-title" className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <span>Status</span>
        </h3>
        <button
          type="button"
          onClick={async () => {
            setBusy(true);
            await refresh();
            setBusy(false);
          }}
          className="p-1.5 text-slate-400 hover:text-slate-200"
          aria-label="Refresh status"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="text-xs text-slate-400">What runs on its own: is it running?</p>
      <dl className="divide-y divide-slate-800">
        <Row label="Hourly job (reminders)" {...jobRow} />
        {!missing && <Row label="Telegram" {...tgRow} />}
        {!missing && status?.hourlyError && <Row label="Last problem" tone="bad" value={status.hourlyError} />}
        <Row label="Exchange rate" {...rateRow} />
        <Row label="Domain and SSL checks" {...checkRow} />
        <Row
          label="Backups and live site check"
          tone="muted"
          value="On GitHub"
          hint="Repository → Actions: “Nightly database backup” and “Live site check” (red means look)."
        />
      </dl>
    </section>
  );
};
