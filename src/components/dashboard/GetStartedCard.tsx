import React, { useState } from 'react';
import { Check, Layers, Link2, CreditCard, Send, Sparkles, X } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

interface Props {
  onAddApp: () => void;
  onUseTemplate: () => void;
  onAddService: () => void;
  onSelectTab: (tab: string) => void;
}

/**
 * First steps for a new live workspace, each with its button. Done steps are ticked; the card goes
 * away once all four are done, or when you hide it (remembered in this browser, per workspace).
 */
const hiddenKey = (workspaceId: string) => `stacktrack_getstarted_hidden:${workspaceId}`;
const readHidden = (workspaceId: string) => {
  try {
    return localStorage.getItem(hiddenKey(workspaceId)) === '1';
  } catch {
    return false;
  }
};

export const GetStartedCard: React.FC<Props> = ({ onAddApp, onUseTemplate, onAddService, onSelectTab }) => {
  const { products, services, paymentSources, notificationSettings, isDemoMode, importDemoStacksIntoLive, setDemoMode, currentWorkspace } =
    useWorkspace();
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);
  if (isDemoMode || hiddenFor === currentWorkspace.id || readHidden(currentWorkspace.id)) return null;
  const hide = () => {
    try {
      localStorage.setItem(hiddenKey(currentWorkspace.id), '1');
    } catch {
      /* storage unavailable: hidden until the page reloads */
    }
    setHiddenFor(currentWorkspace.id);
  };

  const steps = [
    {
      key: 'app',
      icon: Layers,
      title: 'Add an app you run',
      text: 'Each app (for example SaaS Boss) groups what it pays for.',
      done: products.length > 0,
      actions: [
        { label: 'Add app', onClick: onAddApp, primary: true },
        { label: 'Use a starter template', onClick: onUseTemplate },
      ],
    },
    {
      key: 'service',
      icon: Link2,
      title: 'Add what it pays for',
      text: 'Hosting, domain, database, email… with the price and renewal date, so reminders come in time.',
      done: services.length > 0,
      actions: [{ label: 'Add service', onClick: onAddService, primary: true }],
    },
    {
      key: 'card',
      icon: CreditCard,
      title: 'Add the card or person that pays',
      text: 'Your virtual dollar card, or the friend who pays for you: balances and top-ups follow.',
      done: paymentSources.length > 0,
      actions: [{ label: 'Add card or person', onClick: () => onSelectTab('money'), primary: true }],
    },
    {
      key: 'telegram',
      icon: Send,
      title: 'Get reminders on Telegram',
      text: 'Connect the bot in Settings. Renewals and dates then come to Telegram with buttons.',
      done: Boolean(notificationSettings.telegramEnabled && notificationSettings.telegramChatId),
      actions: [{ label: 'Connect Telegram', onClick: () => onSelectTab('telegram'), primary: true }],
    },
  ];
  const left = steps.filter((s) => !s.done).length;
  if (!left) return null;
  const next = steps.find((s) => !s.done)!;

  return (
    <section
      aria-labelledby="get-started-title"
      className="p-5 rounded-2xl bg-slate-900 border border-indigo-500/40 shadow-sm space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="get-started-title" className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" aria-hidden /> Get started
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {steps.length - left} of {steps.length} done. Next: {next.title.toLowerCase()}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {products.length === 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={importDemoStacksIntoLive}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200"
            >
              Import Demo Stacks into Live
            </button>
            <button
              type="button"
              onClick={() => setDemoMode(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200"
            >
              Look around the demo
            </button>
          </div>
        )}
          <button
            type="button"
            onClick={hide}
            title="Hide these steps (you can still do each one from its page)"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-3.5 h-3.5" aria-hidden /> Hide
          </button>
        </div>
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <li
              key={s.key}
              aria-label={`Step ${i + 1}: ${s.title}${s.done ? ' (done)' : ''}`}
              className={`p-4 rounded-xl border ${
                s.done ? 'border-emerald-500/30 bg-emerald-500/5' : s === next ? 'border-indigo-500/50 bg-slate-800/60' : 'border-slate-800 bg-slate-900'
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                    s.done ? 'bg-emerald-500/15 text-emerald-400' : 'bg-indigo-500/15 text-indigo-400'
                  }`}
                  aria-hidden
                >
                  {s.done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className={`text-sm font-semibold ${s.done ? 'text-slate-400 line-through' : 'text-slate-100'}`}>{s.title}</h3>
                  {!s.done && (
                    <>
                      <p className="text-xs text-slate-400 mt-0.5">{s.text}</p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {s.actions.map((a) => (
                          <button
                            key={a.label}
                            type="button"
                            onClick={a.onClick}
                            className={
                              'primary' in a && a.primary
                                ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white'
                                : 'px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200'
                            }
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
