/**
 * Receipts pieces in the Timeline / Portfolio look, used by both layouts: the add / paste bar with its
 * notices and status line, the "To review" card, and the actions on a done receipt.
 */
import React from 'react';
import { Upload, ClipboardPaste, Loader2, Trash2, RotateCcw, Send, Sparkles } from 'lucide-react';
import type { Receipt, ServiceLink } from '../../types';
import { PILL, Pill, Section, Toolbar, btnPrimary, btnSecondary, btnSmall, inputCls } from '../layouts/kit';
import { ReceiptFileButton, ReceiptReviewCard } from './ReceiptReviewCard';
import type { useReceipts } from './useReceipts';

type Inbox = ReturnType<typeof useReceipts>;

/** Add photo or PDF, Paste email text (with its panel), the reading / demo notes and the status line. */
export const ReceiptsAddBar: React.FC<{ inbox: Inbox }> = ({ inbox }) => {
  const { aiReader, isDemoMode, busy, message, pasting, setPasting, text, setText, add, fileInputProps, pickFile } = inbox;
  return (
    <div className="space-y-3">
      <Toolbar
        left={
          aiReader === true ? (
            <p className="text-sm text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" aria-hidden="true" /> Photos, PDFs and emails are read by Claude. Check what it found
              before confirming.
            </p>
          ) : undefined
        }
        right={
          <>
            <input {...fileInputProps} />
            <button type="button" onClick={() => setPasting((v) => !v)} aria-expanded={pasting} className={btnSecondary}>
              <ClipboardPaste className="w-4 h-4" aria-hidden="true" /> Paste email text
            </button>
            <button type="button" onClick={pickFile} disabled={busy} className={btnPrimary}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Upload className="w-4 h-4" aria-hidden="true" />} Add photo or PDF
            </button>
          </>
        }
      />

      {aiReader === false && (
        <p className={`text-sm rounded-xl px-3 py-2 ${PILL.warn}`}>
          Automatic reading is off. Add <code className="font-mono">ANTHROPIC_API_KEY</code> in Vercel to have Claude read photos and PDFs. Pasted and
          forwarded email text is still read.
        </p>
      )}
      {isDemoMode && (
        <p className="text-sm text-slate-300 flex items-center gap-1.5">
          <Send className="w-4 h-4 text-indigo-400 shrink-0" aria-hidden="true" /> Demo: files aren't stored and aren't read automatically. Pasted text is
          read.
        </p>
      )}

      {pasting && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3">
          <label className="block text-sm font-semibold text-slate-200" htmlFor="receipt-text">
            Receipt or payment email text
          </label>
          <textarea
            id="receipt-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={'From: Vercel <billing@vercel.com>\nAmount paid $20.00 on Nov 5, 2026\nVisa ending in 4821'}
            className={`${inputCls} py-2 font-mono text-xs`}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setPasting(false)} className={btnSecondary}>
              Cancel
            </button>
            <button type="button" onClick={() => add({ text })} disabled={busy || !text.trim()} className={btnPrimary}>
              Read text
            </button>
          </div>
        </div>
      )}

      {message && (
        <p role="status" className={`text-sm ${message.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
};

/** The receipts waiting for you, pinned on top, each with its form. */
export const ReviewSection: React.FC<{ inbox: Inbox; aside?: (service: ServiceLink | undefined) => React.ReactNode }> = ({ inbox, aside }) => (
  <Section id="receipts-review" title={`To review (${inbox.open.length})`}>
    {inbox.open.length === 0 ? (
      <p className="px-5 py-8 text-sm text-slate-400 text-center">Nothing to review. Send a receipt to your Telegram bot, or add one above.</p>
    ) : (
      inbox.open.map((r) => <ReceiptReviewCard key={r.id} receipt={r} look="kit" aside={aside} onDelete={() => inbox.remove(r)} />)
    )}
  </Section>
);

/** Saved or Ignored. */
export const DonePill: React.FC<{ receipt: Receipt }> = ({ receipt }) =>
  receipt.status === 'confirmed' ? <Pill tone="ok">Saved</Pill> : <Pill tone="free">Ignored</Pill>;

/** Open file, Review again (ignored ones) and Delete, for a done receipt. */
export const DoneActions: React.FC<{ receipt: Receipt; inbox: Inbox }> = ({ receipt: r, inbox }) => (
  <>
    <ReceiptFileButton receipt={r} look="kit" />
    {r.status === 'ignored' && (
      <button type="button" onClick={() => inbox.restore(r.id)} className={btnSmall}>
        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Review again
      </button>
    )}
    <button
      type="button"
      onClick={() => inbox.remove(r)}
      className="inline-flex items-center justify-center min-h-[32px] min-w-[32px] rounded-full text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
      aria-label="Delete receipt"
      title="Delete receipt"
    >
      <Trash2 className="w-4 h-4" aria-hidden="true" />
    </button>
  </>
);
