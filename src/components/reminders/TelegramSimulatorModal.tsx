import React, { useState } from 'react';
import {
  Send,
  X,
  Bot,
  ExternalLink,
  Mail,
  CheckCircle,
  Copy,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { formatDate, formatCurrency } from '../../utils/formatters';

interface TelegramSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChatMessage {
  sender: 'user' | 'bot';
  text: string;
  time: string;
}

export const TelegramSimulatorModal: React.FC<TelegramSimulatorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    notificationSettings,
    updateNotificationSettings,
    dates,
    services,
    currentWorkspace,
    snoozeImportantDate,
    isDemoMode,
  } = useWorkspace();

  const [activeTab, setActiveTab] = useState<'telegram' | 'email'>('telegram');
  const [copiedCode, setCopiedCode] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatLog, setChatLog] = useState<ChatMessage[]>([
    {
      sender: 'bot',
      text: '🤖 Welcome to StackTrack Bot! Link your account using `/start <verification-code>` or type `/due` to inspect renewals.',
      time: '08:00',
    },
  ]);

  if (!isOpen) return null;

  const verificationCode = notificationSettings.telegramVerificationCode || 'ST-8924';

  const copyCode = () => {
    navigator.clipboard.writeText(`/start ${verificationCode}`);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleSendTelegramCommand = (cmdText?: string) => {
    const textToSend = cmdText || chatInput.trim();
    if (!textToSend) return;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = { sender: 'user', text: textToSend, time };

    let botResponse = '';

    if (textToSend.startsWith('/start')) {
      const parts = textToSend.split(' ');
      const code = parts[1];
      if (!isDemoMode) {
        // This is only a simulator: never store a fake chat id on a real workspace.
        botResponse = `ℹ️ This is a simulator. To link your real Telegram, go to Workspace Settings → Telegram Bot → Connect Telegram.`;
      } else if (code === verificationCode) {
        updateNotificationSettings({ telegramChatId: '984572102', telegramEnabled: true });
        botResponse = `✅ Telegram successfully linked to "${currentWorkspace.name}"! You will receive daily summaries at ${notificationSettings.digestTime} (${currentWorkspace.timezone}). Try /due or /week.`;
      } else {
        botResponse = `❌ Invalid verification code. Please copy your unique code from StackTrack settings.`;
      }
    } else if (textToSend === '/due') {
      const openDates = dates.filter((d) => d.status !== 'done').slice(0, 3);
      const renews = services.filter((s) => s.status === 'active' && s.renewalDate).slice(0, 3);

      botResponse = `📅 **StackTrack Due & Renewals:**\n` +
        openDates.map((d) => `• ⚠️ ${d.title} (due ${formatDate(d.dueDate)})`).join('\n') +
        `\n` +
        renews.map((s) => `• 💳 ${s.providerName} (${formatCurrency(s.cost, s.currency)} renews ${formatDate(s.renewalDate)})`).join('\n');
    } else if (textToSend === '/week') {
      botResponse = `🗓️ **Items Due in the Next 7 Days:**\n• Supabase master key rotation (in 4 days)\n• Vercel Pro Team renewal ($20, in 5 days)\n• Barcode Cloud trial ends (in 6 days)\n• Sentry Team Tier renewal ($26, in 7 days)`;
    } else if (textToSend.startsWith('/snooze')) {
      const parts = textToSend.split(' ');
      const dateId = parts[1] || dates[0]?.id;
      const days = parseInt(parts[2] || '7', 10);
      if (dateId) {
        snoozeImportantDate(dateId, days);
        botResponse = `💤 Snoozed item #${dateId} for ${days} days. Alert updated in StackTrack!`;
      } else {
        botResponse = `Usage: /snooze <id> <days> (e.g. /snooze date-1 7)`;
      }
    } else {
      botResponse = `ℹ️ Available commands:\n• /due - View upcoming & overdue renewals\n• /week - Due in the next 7 days\n• /snooze <id> <days> - Snooze an alert\n• /start <code> - Re-verify account`;
    }

    setChatLog((prev) => [
      ...prev,
      userMsg,
      { sender: 'bot', text: botResponse, time },
    ]);
    setChatInput('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl relative text-slate-100 my-8 max-h-[90vh] overflow-y-auto flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">
              Notification Channels & Bot Runner
            </h3>
            <p className="text-xs text-slate-400">
              Telegram webhook integration & Email digest delivery engine
            </p>
          </div>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('telegram')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'telegram'
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Telegram Bot Runner</span>
          </button>
          <button
            onClick={() => setActiveTab('email')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'email'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Daily Email Digest Preview</span>
          </button>
        </div>

        {activeTab === 'telegram' ? (
          <div className="space-y-4">
            {/* Connection Banner */}
            <div className="p-3.5 rounded-xl bg-slate-850 border border-slate-750 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Shared Telegram Bot: @StackTrackBot
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Token: in Secret Manager
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-xs">
                <div className="text-slate-300">
                  Verification Code: <strong className="text-sky-300 font-mono">{verificationCode}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyCode}
                    className="px-2.5 py-1 rounded-lg bg-slate-750 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedCode ? 'Copied command!' : 'Copy /start command'}</span>
                  </button>
                  <a
                    href={`https://t.me/StackTrackBot?start=${verificationCode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1"
                  >
                    <span>Open in Telegram</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* Quick Command Chips */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-400 text-[11px]">Quick test commands:</span>
              <button
                onClick={() => handleSendTelegramCommand('/due')}
                className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-sky-300 font-mono text-[11px]"
              >
                /due
              </button>
              <button
                onClick={() => handleSendTelegramCommand('/week')}
                className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-sky-300 font-mono text-[11px]"
              >
                /week
              </button>
              <button
                onClick={() => handleSendTelegramCommand('/snooze date-1 7')}
                className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-sky-300 font-mono text-[11px]"
              >
                /snooze date-1 7
              </button>
            </div>

            {/* Interactive Chat Console Window */}
            <div className="border border-slate-800 rounded-xl bg-slate-950 p-3 h-56 overflow-y-auto space-y-2.5 font-sans text-xs">
              {chatLog.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                      msg.sender === 'user'
                        ? 'bg-sky-600 text-white rounded-tr-xs'
                        : 'bg-slate-800 text-slate-200 border border-slate-700/70 rounded-tl-xs'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[9px] text-slate-500 mt-0.5 px-1">{msg.time}</span>
                </div>
              ))}
            </div>

            {/* Chat Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendTelegramCommand();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type /due, /week, or /snooze..."
                className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-sky-500"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </form>
          </div>
        ) : (
          /* Email Digest Simulator Tab */
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-850 border border-slate-750 text-slate-300 space-y-1">
              <div className="flex items-center justify-between">
                <span>To: <strong className="text-indigo-300">{notificationSettings.email}</strong></span>
                <span className="text-[10px] text-slate-500 font-mono">Dispatched daily at {notificationSettings.digestTime}</span>
              </div>
              <div>Subject: <strong className="text-slate-100">StackTrack Daily Digest: 1 Overdue, 3 Upcoming Renewals</strong></div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-[11px] text-slate-300">
              <div className="text-indigo-400 font-bold border-b border-slate-800 pb-1">
                STACKTRACK MORNING REPORT • {currentWorkspace.name}
              </div>
              <p>Good morning! Here is your SaaS stack operational summary for today:</p>

              <div className="bg-rose-950/30 p-2.5 rounded border border-rose-900/40 text-rose-300 space-y-1">
                <div className="font-bold text-rose-400">⚠️ OVERDUE ACTION REQUIRED:</div>
                <div>• Minimart.et domain expired 2 days ago. Manual wire required.</div>
              </div>

              <div className="space-y-1 pt-1">
                <div className="font-bold text-slate-200">UPCOMING THIS WEEK:</div>
                <div>• Oct 27: Rotate Supabase Postgres Master Password (PharmaFlow)</div>
                <div>• Oct 28: Vercel Pro Team Renewal - $20 USD (PharmaFlow)</div>
                <div>• Oct 29: Barcode Cloud Lookup Trial Ends (MiniMart ERP)</div>
                <div>• Oct 30: Sentry Team Tier Renewal - $26 USD (PharmaFlow)</div>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-between text-slate-400">
                <span>Total Monthly Burn: $125 USD (16,250 ETB)</span>
                <span>Workspace: {currentWorkspace.name}</span>
              </div>
            </div>
          </div>
        )}

        <div className="pt-4 mt-auto flex justify-end border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-750"
          >
            Close Runner
          </button>
        </div>
      </div>
    </div>
  );
};
