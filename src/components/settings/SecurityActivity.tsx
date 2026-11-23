import React from 'react';
import { History, RefreshCw } from 'lucide-react';
import { SECURITY_LABELS as LABELS } from '../../utils/settingsPages';
import { useSecurityEvents } from './useSecurityEvents';

function ago(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Settings → Security → recent security activity (sign-ins, unlocks, exports, 2FA/passkey/Telegram changes). */
export const SecurityActivity: React.FC = () => {
  const { rows, load } = useSecurityEvents();

  return (
    <section className="space-y-2 pt-4 border-t border-slate-800" aria-labelledby="secact-title">
      <div className="flex items-center justify-between">
        <h4 id="secact-title" className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-slate-400" /> Security activity
        </h4>
        <button type="button" onClick={load} className="p-1 text-slate-400 hover:text-slate-200" aria-label="Refresh security activity">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      {rows === null ? (
        <p className="text-[11px] text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-slate-500">No security events yet.</p>
      ) : (
        <ul className="max-h-60 overflow-y-auto divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-850">
          {rows.map((r) => {
            const meta = LABELS[r.action] ?? { icon: '•', label: r.action };
            return (
              <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2 text-xs">
                <span className="min-w-0">
                  <span aria-hidden="true">{meta.icon}</span>{' '}
                  <span className={`font-semibold ${meta.warn ? 'text-amber-300' : 'text-slate-200'}`}>{meta.label}</span>
                  {r.details && <span className="text-slate-400"> · {r.details}</span>}
                  {r.changed_by === 'telegram' && <span className="text-slate-500"> (via Telegram)</span>}
                </span>
                <time dateTime={r.timestamp} className="text-[10px] text-slate-500 shrink-0">
                  {ago(r.timestamp)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
