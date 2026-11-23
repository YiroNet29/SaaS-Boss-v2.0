import React, { useState } from 'react';
import { Receipt as ReceiptIcon, Upload, ClipboardPaste, Loader2, Trash2, RotateCcw, Send, Sparkles } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { receiptHeadline } from '../../utils/receipts';
import type { Receipt } from '../../types';
import { useReceipts } from './useReceipts';
import { CHANNEL, ReceiptFileButton, ReceiptReviewCard } from './ReceiptReviewCard';

const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-50';
const btn2 = `${btn} bg-stone-100 dark:bg-slate-800 border border-stone-300 dark:border-slate-700 text-stone-700 dark:text-slate-200`;
const card = 'rounded-2xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800';
const muted = 'text-stone-500 dark:text-slate-400';
const warnText = 'text-amber-700 dark:text-amber-300';
const inputCls =
  'w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-slate-800 border border-stone-300 dark:border-slate-700 text-sm text-stone-900 dark:text-slate-100 placeholder-stone-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-indigo-500';
const labelCls = 'block text-xs font-semibold text-stone-600 dark:text-slate-300 mb-1';

/** Receipts inbox: everything sent to the bot or added here, waiting for you to confirm. */
export const ReceiptsView: React.FC = () => {
  const { open, done, isDemoMode, aiReader, busy, message, pasting, setPasting, text, setText, add, remove, restore, fileInputProps, pickFile } =
    useReceipts();
  const [showDone, setShowDone] = useState(false);

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-20 md:pb-8">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-stone-900 dark:text-slate-100 flex items-center gap-2">
            <ReceiptIcon className="w-5 h-5 text-indigo-400" /> Receipts
          </h1>
          <p className={`text-xs ${muted} mt-1 max-w-xl`}>
            Send receipts to your Telegram bot (photo, PDF or forwarded email) or add them here. They are stored privately;
            nothing is recorded as paid until you confirm.
          </p>
        </div>
        <div className="flex gap-2">
          <input {...fileInputProps} />
          <button onClick={pickFile} disabled={busy} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Add photo or PDF
          </button>
          <button onClick={() => setPasting((v) => !v)} className={btn2}>
            <ClipboardPaste className="w-3.5 h-3.5" /> Paste email text
          </button>
        </div>
      </header>

      {aiReader === false && (
        <p className={`text-xs rounded-xl border border-amber-500/30 bg-amber-500/10 ${warnText} px-3 py-2`}>
          Automatic reading is off. Add <code className="font-mono">ANTHROPIC_API_KEY</code> in Vercel to have Claude read photos and
          PDFs. Pasted and forwarded email text is still read.
        </p>
      )}
      {aiReader === true && (
        <p className={`text-[11px] ${muted} flex items-center gap-1.5`}>
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Photos, PDFs and emails are read by Claude. Check what it found before confirming.
        </p>
      )}
      {isDemoMode && (
        <p className={`text-[11px] ${muted} flex items-center gap-1.5`}>
          <Send className="w-3.5 h-3.5 text-sky-400" /> Demo: files aren't stored and aren't read automatically. Pasted text is read.
        </p>
      )}

      {pasting && (
        <div className={`${card} p-4 space-y-2`}>
          <label className={labelCls} htmlFor="receipt-text">
            Receipt or payment email text
          </label>
          <textarea
            id="receipt-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={'From: Vercel <billing@vercel.com>\nAmount paid $20.00 on Nov 5, 2026\nVisa ending in 4821'}
            className={`${inputCls} font-mono text-xs`}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setPasting(false)} className={btn2}>
              Cancel
            </button>
            <button onClick={() => add({ text })} disabled={busy || !text.trim()} className={`${btn} bg-indigo-600 text-white`}>
              Read text
            </button>
          </div>
        </div>
      )}

      {message && (
        <p role="status" className={`text-xs ${message.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}`}>
          {message.text}
        </p>
      )}

      <section aria-label="Receipts to review" className="space-y-3">
        <h2 className="text-sm font-semibold text-stone-800 dark:text-slate-200">To review ({open.length})</h2>
        {open.length === 0 && (
          <p className={`text-xs ${muted} rounded-2xl border border-dashed border-stone-300 dark:border-slate-800 p-6 text-center`}>
            Nothing to review. Send a receipt to your Telegram bot, or add one above.
          </p>
        )}
        {open.map((r) => (
          <ReceiptReviewCard key={r.id} receipt={r} onDelete={() => remove(r)} />
        ))}
      </section>

      {done.length > 0 && (
        <section aria-label="Done receipts" className="space-y-2">
          <button onClick={() => setShowDone((v) => !v)} className="text-sm font-semibold text-stone-700 dark:text-slate-300 hover:text-stone-900 dark:hover:text-slate-100">
            {showDone ? '▾' : '▸'} Done ({done.length})
          </button>
          {showDone && (
            <ul className={`${card} divide-y divide-stone-200 dark:divide-slate-800`}>
              {done.map((r) => (
                <DoneRow key={r.id} receipt={r} onRestore={() => restore(r.id)} onDelete={() => remove(r)} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
};

const DoneRow: React.FC<{ receipt: Receipt; onRestore: () => void; onDelete: () => void }> = ({ receipt: r, onRestore, onDelete }) => {
  const { services } = useWorkspace();
  const svc = services.find((s) => s.id === r.serviceLinkId);
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs">
      <span className={`px-2 py-0.5 rounded-md font-semibold ${r.status === 'confirmed' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-stone-200 dark:bg-slate-700/60 text-stone-600 dark:text-slate-300'}`}>
        {r.status === 'confirmed' ? 'Saved' : 'Ignored'}
      </span>
      <span className="text-stone-800 dark:text-slate-200 font-medium">{receiptHeadline(r.extracted)}</span>
      {svc && <span className={muted}>→ {svc.providerName}</span>}
      <span className={muted}>{CHANNEL[r.channel]} · {r.createdAt.slice(0, 10)}</span>
      <span className="ml-auto flex gap-1.5">
        <ReceiptFileButton receipt={r} />
        {r.status === 'ignored' && (
          <button onClick={onRestore} className={btn2}>
            <RotateCcw className="w-3.5 h-3.5" /> Review again
          </button>
        )}
        <button onClick={onDelete} className={`${btn} text-rose-600 dark:text-rose-300 hover:bg-rose-500/10`} aria-label="Delete receipt">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </span>
    </li>
  );
};
