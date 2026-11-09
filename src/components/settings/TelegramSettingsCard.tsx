import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, CheckCircle2, Circle, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { getSupabase } from '../../lib/supabase/client';
import { useSensitiveAction } from '../../context/LockContext';

interface TelegramStatus {
  tokenSet: boolean;
  secretSet: boolean;
  secretValid: boolean;
  bot?: { username: string; name: string };
  webhook?: { url: string; expectedUrl: string; connected: boolean; pendingUpdates: number; lastError?: string; lastErrorAt?: string };
  error?: string;
}

interface Props {
  telegramEnabled: boolean;
  setTelegramEnabled: (v: boolean) => void;
}

async function authedFetch(path: string, init: RequestInit = {}) {
  const { data } = await getSupabase().auth.getSession();
  const res = await fetch(path, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${data.session?.access_token ?? ''}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

const Step: React.FC<{ done: boolean; title: string; children?: React.ReactNode }> = ({ done, title, children }) => (
  <li className="flex gap-2.5">
    {done ? (
      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-label="Done" />
    ) : (
      <Circle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" aria-label="Not done" />
    )}
    <div className="min-w-0 flex-1">
      <p className={`text-xs font-semibold ${done ? 'text-slate-200' : 'text-slate-300'}`}>{title}</p>
      {children && <div className="mt-1 text-[11px] text-slate-400 space-y-1.5">{children}</div>}
    </div>
  </li>
);

/** Telegram is the main reminder channel: setup checklist, link this chat, on/off switch. */
export const TelegramSettingsCard: React.FC<Props> = ({ telegramEnabled, setTelegramEnabled }) => {
  const { isDemoMode, currentWorkspace, notificationSettings, updateNotificationSettings, reloadLiveData } = useWorkspace();
  const sensitive = useSensitiveAction();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'status' | 'setup' | 'link' | null>(null);
  const [waitingForStart, setWaitingForStart] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const linkedChat = notificationSettings.telegramChatId;
  const botUsername = status?.bot?.username || process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || '';

  const loadStatus = useCallback(async () => {
    setBusy('status');
    setStatusError(null);
    try {
      setStatus(await authedFetch('/api/telegram/status'));
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    if (!isDemoMode) loadStatus();
  }, [isDemoMode, loadStatus]);

  useEffect(() => () => {
    if (pollTimer.current) clearInterval(pollTimer.current);
  }, []);

  const runSetup = async () => {
    setBusy('setup');
    setStatusError(null);
    try {
      setStatus(await authedFetch('/api/telegram/setup', { method: 'POST' }));
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  // Open the bot with a one-time code, then watch for the bot to record this chat.
  const connect = async () => {
    if (linkedChat && !(await sensitive('move Telegram reminders to another chat'))) return;
    const code =
      notificationSettings.telegramVerificationCode ||
      'ST-' + crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
    updateNotificationSettings({ telegramVerificationCode: code, telegramEnabled: true });
    setTelegramEnabled(true);
    if (botUsername) window.open(`https://t.me/${botUsername}?start=${code}`, '_blank', 'noopener');

    setWaitingForStart(true);
    if (pollTimer.current) clearInterval(pollTimer.current);
    const started = Date.now();
    pollTimer.current = setInterval(async () => {
      const { data } = await getSupabase()
        .from('notification_settings')
        .select('telegram_chat_id')
        .eq('workspace_id', currentWorkspace.id)
        .maybeSingle();
      const chat = (data as { telegram_chat_id?: string } | null)?.telegram_chat_id;
      if (chat || Date.now() - started > 3 * 60_000) {
        if (pollTimer.current) clearInterval(pollTimer.current);
        setWaitingForStart(false);
        if (chat) reloadLiveData();
      }
    }, 3000);
  };

  if (isDemoMode) {
    return (
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <Send className="w-4 h-4 text-sky-400" /> Telegram reminders
        </h3>
        <p className="text-xs text-slate-400">
          In your live workspace, reminders arrive in Telegram with ✅ Done / 😴 Snooze / ✅ Paid buttons, and you can send the bot
          receipts, /due and /month. Set it up from Settings in your live workspace.
        </p>
      </div>
    );
  }

  const tokenOk = !!status?.tokenSet && !!status?.secretValid && !status?.error;
  const webhookOk = !!status?.webhook?.connected;

  return (
    <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Send className="w-4 h-4 text-sky-400" /> Telegram reminders
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">Main</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">Reminders arrive here with ✅ Done, 😴 Snooze and ✅ Paid buttons.</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={telegramEnabled}
            onChange={(e) => setTelegramEnabled(e.target.checked)}
            className="w-4 h-4 rounded"
          />
          On
        </label>
      </div>

      {busy === 'status' && !status ? (
        <p className="text-xs text-slate-400 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking the bot…
        </p>
      ) : (
        <ol className="space-y-3">
          <Step done={tokenOk} title={tokenOk ? `Bot found: @${status?.bot?.username}` : 'Add your bot to Vercel'}>
            {!tokenOk && (
              <>
                <p>
                  Create a bot with <b>@BotFather</b> in Telegram (<code>/newbot</code>). In Vercel → Settings → Environment
                  Variables add <code>TELEGRAM_BOT_TOKEN</code> (from BotFather) and <code>TELEGRAM_WEBHOOK_SECRET</code> (any
                  long string of letters, numbers, <code>_</code> or <code>-</code>), then redeploy.
                </p>
                {status?.tokenSet && !status.secretValid && (
                  <p className="text-amber-300">TELEGRAM_WEBHOOK_SECRET is missing or has characters Telegram doesn't allow.</p>
                )}
                {status?.error && <p className="text-rose-400">{status.error}</p>}
              </>
            )}
          </Step>

          <Step done={webhookOk} title={webhookOk ? 'Bot connected to this app' : 'Connect the bot to this app'}>
            {tokenOk && (
              <>
                {!webhookOk && <p>One click: points the bot at this app and sets its command menu.</p>}
                <button
                  type="button"
                  onClick={runSetup}
                  disabled={busy !== null}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-60 ${
                    webhookOk
                      ? 'bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                >
                  {busy === 'setup' ? 'Setting up…' : webhookOk ? 'Run setup again' : 'Set up bot'}
                </button>
                {status?.webhook?.lastError && (
                  <p className="text-amber-300 flex gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                    Telegram's last delivery error: {status.webhook.lastError}
                  </p>
                )}
              </>
            )}
          </Step>

          <Step done={!!linkedChat} title={linkedChat ? 'Your chat is linked' : 'Link your Telegram chat'}>
            {webhookOk && (
              <>
                {!linkedChat && <p>Opens the bot; press <b>Start</b> there and this page updates by itself.</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={connect}
                    disabled={!botUsername}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-60 ${
                      linkedChat
                        ? 'bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {linkedChat ? 'Re-link' : 'Connect Telegram'} <ExternalLink className="w-3 h-3" />
                  </button>
                  {waitingForStart && (
                    <span className="flex items-center gap-1.5 text-sky-300">
                      <Loader2 className="w-3 h-3 animate-spin" /> Waiting for you to press Start…
                    </span>
                  )}
                </div>
                {notificationSettings.telegramVerificationCode && !linkedChat && botUsername && (
                  <p>
                    Or send <code className="text-indigo-300">/start {notificationSettings.telegramVerificationCode}</code> to @
                    {botUsername}
                  </p>
                )}
              </>
            )}
          </Step>
        </ol>
      )}

      {statusError && <p className="text-xs text-rose-400">{statusError}</p>}
    </div>
  );
};
