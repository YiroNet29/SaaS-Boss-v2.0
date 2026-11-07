import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Receipt as ReceiptIcon, Upload, ClipboardPaste, FileText, Image as ImageIcon, Loader2, Trash2, RotateCcw, Check, EyeOff, Send, Sparkles, ExternalLink } from 'lucide-react';
import { useWorkspace, type ReceiptDraft } from '../../context/WorkspaceContext';
import { useSensitiveAction } from '../../context/LockContext';
import { NumberField } from '../common/NumberField';
import { authedFetch } from '../../lib/api-client';
import { formatCurrency } from '../../utils/formatters';
import { describePlan, isSavableCurrency, planReceiptPayment, receiptHeadline } from '../../utils/receipts';
import type { Currency, Receipt } from '../../types';

const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-50';
const btn2 = `${btn} bg-stone-100 dark:bg-slate-800 border border-stone-300 dark:border-slate-700 text-stone-700 dark:text-slate-200`;
const card = 'rounded-2xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800';
const muted = 'text-stone-500 dark:text-slate-400';
const warnText = 'text-amber-700 dark:text-amber-300';
const inputCls =
  'w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-slate-800 border border-stone-300 dark:border-slate-700 text-sm text-stone-900 dark:text-slate-100 placeholder-stone-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-indigo-500';
const labelCls = 'block text-xs font-semibold text-stone-600 dark:text-slate-300 mb-1';
const CHANNEL: Record<Receipt['channel'], string> = { telegram: 'Telegram', upload: 'Uploaded', email: 'Email' };
const READ_BY: Record<string, string> = { claude: 'Read by Claude', text: 'Read from the text', manual: 'Type in the details' };
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,application/pdf';

/** Receipts inbox: everything sent to the bot or added here, waiting for you to confirm. */
export const ReceiptsView: React.FC = () => {
  const { receipts, addReceipt, isDemoMode, deleteReceipt, restoreReceipt } = useWorkspace();
  const sensitive = useSensitiveAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [aiReader, setAiReader] = useState<boolean | null>(null);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    if (isDemoMode) return setAiReader(null);
    authedFetch<{ aiReader: boolean }>('/api/receipts/read')
      .then((r) => setAiReader(r.aiReader))
      .catch(() => setAiReader(null));
  }, [isDemoMode]);

  const open = receipts.filter((r) => r.status !== 'confirmed' && r.status !== 'ignored');
  const done = receipts.filter((r) => r.status === 'confirmed' || r.status === 'ignored');

  const add = async (input: { file?: File; text?: string }) => {
    setBusy(true);
    setMessage(null);
    const res = await addReceipt(input);
    setBusy(false);
    if (!res.ok) return setMessage({ tone: 'error', text: res.error ?? 'Could not add the receipt.' });
    setMessage({ tone: 'ok', text: 'Receipt added. Check the details below and confirm.' });
    setText('');
    setPasting(false);
  };

  const remove = async (r: Receipt) => {
    if (!window.confirm('Delete this receipt and its file? Any payment it was saved to stays.')) return;
    if (!(await sensitive('delete a receipt'))) return;
    await deleteReceipt(r.id);
  };

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
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            aria-label="Receipt file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void add({ file: f });
            }}
          />
          <button onClick={() => fileRef.current?.click()} disabled={busy} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>
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
          <ReceiptCard key={r.id} receipt={r} onDelete={() => remove(r)} />
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
                <DoneRow key={r.id} receipt={r} onRestore={() => restoreReceipt(r.id)} onDelete={() => remove(r)} />
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
        <FileButton receipt={r} />
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

/** Opens the stored file through a short-lived private link. */
const FileButton: React.FC<{ receipt: Receipt }> = ({ receipt }) => {
  const { receiptFileUrl } = useWorkspace();
  if (!receipt.mimeType || receipt.mimeType === 'text/plain') return null;
  return (
    <button
      onClick={async () => {
        const url = await receiptFileUrl(receipt);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
        else window.alert('The file is not available here (demo receipts have no stored file).');
      }}
      className={btn2}
    >
      <ExternalLink className="w-3.5 h-3.5" /> Open file
    </button>
  );
};

const Preview: React.FC<{ receipt: Receipt }> = ({ receipt: r }) => {
  const { receiptFileUrl } = useWorkspace();
  const [url, setUrl] = useState<string | null>(null);
  const isImage = r.mimeType?.startsWith('image/') && r.mimeType !== 'image/heic';
  useEffect(() => {
    let live = true;
    if (isImage && (r.storagePath || r.channel === 'upload')) receiptFileUrl(r).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id, r.storagePath]);

  if (r.textContent) {
    return (
      <pre className="text-[11px] leading-relaxed text-stone-700 dark:text-slate-300 bg-stone-50 dark:bg-slate-950/60 border border-stone-200 dark:border-slate-800 rounded-xl p-3 max-h-56 overflow-auto whitespace-pre-wrap break-words">
        {r.textContent.slice(0, 3000)}
      </pre>
    );
  }
  if (isImage && url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img src={url} alt="Receipt" className="w-full max-h-56 object-contain rounded-xl border border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-950" />
      </a>
    );
  }
  const Icon = isImage ? ImageIcon : FileText;
  return (
    <div className={`flex flex-col items-center justify-center gap-2 h-32 rounded-xl border border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-950/60 ${muted} text-xs`}>
      <Icon className="w-6 h-6" />
      <span className="truncate max-w-[90%]">{r.originalName || (isImage ? 'Photo' : 'File')}</span>
      <FileButton receipt={r} />
    </div>
  );
};

const ReceiptCard: React.FC<{ receipt: Receipt; onDelete: () => void }> = ({ receipt: r, onDelete }) => {
  const { services, products, paymentSources, payments, currentWorkspace, confirmReceipt, ignoreReceipt, rereadReceipt } = useWorkspace();
  const d = r.extracted;
  const rate = currentWorkspace.exchangeRates?.ETB_per_USD || 155;
  const blank = (): ReceiptDraft => ({
    vendor: d.vendor ?? '',
    amount: isSavableCurrency(d.currency) ? (d.amount ?? 0) : 0,
    currency: isSavableCurrency(d.currency) ? d.currency : 'USD',
    date: d.date ?? r.createdAt.slice(0, 10),
    serviceLinkId: d.suggestedServiceId ?? '',
    sourceId: d.suggestedSourceId ?? '',
  });
  const [draft, setDraft] = useState<ReceiptDraft>(blank);
  const [result, setResult] = useState<string | null>(null);
  const [rereading, setRereading] = useState(false);
  // Refill the form when the receipt is read (again).
  useEffect(() => setDraft(blank()), [r.status, r.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof ReceiptDraft>(k: K, v: ReceiptDraft[K]) => setDraft((x) => ({ ...x, [k]: v }));
  const productName = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
  const service = services.find((s) => s.id === draft.serviceLinkId);
  const today = new Date().toLocaleDateString('en-CA');
  const plan = draft.date ? planReceiptPayment({ receiptId: r.id, date: draft.date, service, payments, today }) : null;
  const foreign = d.amount !== undefined && d.currency && !isSavableCurrency(d.currency);
  const canConfirm = r.status !== 'reading' && draft.amount > 0 && Boolean(draft.date);

  const confirm = () => {
    const res = confirmReceipt(r.id, { ...draft, serviceLinkId: draft.serviceLinkId || undefined, sourceId: draft.sourceId || undefined });
    setResult(res.ok ? null : res.note);
  };
  const reread = async () => {
    setRereading(true);
    const res = await rereadReceipt(r.id);
    setRereading(false);
    if (!res.ok) setResult(res.error ?? 'Could not read it.');
  };

  return (
    <article aria-label={`Receipt ${receiptHeadline(d)}`} className={`${card} p-4 grid gap-4 md:grid-cols-[minmax(0,15rem)_1fr]`}>
      <div className="space-y-2">
        <Preview receipt={r} />
        <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
          <span className="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-700 dark:text-sky-300">{CHANNEL[r.channel]}</span>
          <span className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-slate-800 text-stone-600 dark:text-slate-300">{r.createdAt.slice(0, 10)}</span>
          {d.readBy && <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">{READ_BY[d.readBy]}</span>}
        </div>
      </div>

      <div className="space-y-3 min-w-0">
        {r.status === 'reading' ? (
          <p className="text-xs text-stone-700 dark:text-slate-300 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> Reading the receipt…
          </p>
        ) : (
          <>
            {d.isReceipt === false && <p className={`text-xs ${warnText}`}>This doesn't look like a receipt. Ignore it, or fill it in if it is one.</p>}
            {r.error && <p className={`text-xs ${warnText}`}>{r.error}</p>}
            {d.summary && <p className={`text-xs ${muted}`}>{d.summary}{d.invoiceNumber ? ` · #${d.invoiceNumber}` : ''}</p>}
          </>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2">
            <label className={labelCls} htmlFor={`v-${r.id}`}>Vendor</label>
            <input id={`v-${r.id}`} className={inputCls} value={draft.vendor ?? ''} onChange={(e) => set('vendor', e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor={`a-${r.id}`}>Amount</label>
            <NumberField id={`a-${r.id}`} className={inputCls} value={draft.amount} onValueChange={(n) => set('amount', n)} emptyWhenZero min={0} step="0.01" />
          </div>
          <div>
            <label className={labelCls} htmlFor={`c-${r.id}`}>Currency</label>
            <select id={`c-${r.id}`} className={inputCls} value={draft.currency} onChange={(e) => set('currency', e.target.value as Currency)}>
              <option value="USD">USD</option>
              <option value="ETB">ETB</option>
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls} htmlFor={`d-${r.id}`}>Date paid</label>
            <input id={`d-${r.id}`} type="date" className={inputCls} value={draft.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div className="col-span-2 sm:col-span-2">
            <label className={labelCls} htmlFor={`s-${r.id}`}>Service</label>
            <select id={`s-${r.id}`} className={inputCls} value={draft.serviceLinkId} onChange={(e) => set('serviceLinkId', e.target.value)}>
              <option value="">Not linked to a service</option>
              {services
                .filter((s) => s.status !== 'cancelled' || s.id === draft.serviceLinkId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.providerName} · {productName.get(s.productId) ?? 'no product'}
                    {s.cost ? ` (${formatCurrency(s.cost, s.currency)})` : ''}
                  </option>
                ))}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelCls} htmlFor={`p-${r.id}`}>Paid with</label>
            <select id={`p-${r.id}`} className={inputCls} value={draft.sourceId} onChange={(e) => set('sourceId', e.target.value)}>
              <option value="">Not set</option>
              {paymentSources
                .filter((s) => !s.archived)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.last4 ? ` •••• ${s.last4}` : ''}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {foreign && (
          <p className={`text-xs ${warnText}`}>
            The receipt shows {d.currency} {d.amount}. Enter what it cost in USD or birr.
          </p>
        )}
        {d.cardLast4 && !paymentSources.some((s) => s.last4 === d.cardLast4) && (
          <p className={`text-[11px] ${muted}`}>Charged to a card ending {d.cardLast4} that isn't in Cards & Payments yet.</p>
        )}
        {draft.currency === 'USD' && draft.amount > 0 && (
          <p className={`text-[11px] ${muted}`}>≈ {formatCurrency(Math.round(draft.amount * rate), 'ETB')} at today's rate</p>
        )}

        {plan && draft.amount > 0 && (
          <p className="text-xs text-stone-700 dark:text-slate-300 rounded-xl bg-stone-50 dark:bg-slate-800/60 border border-stone-200 dark:border-slate-700/60 px-3 py-2">
            <Check className="w-3.5 h-3.5 inline mr-1 text-emerald-400" />
            Confirm: {describePlan(plan, service?.providerName)}
          </p>
        )}
        {result && <p className="text-xs text-rose-600 dark:text-rose-300">{result}</p>}

        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={confirm} disabled={!canConfirm} className={`${btn} bg-emerald-600 hover:bg-emerald-500 text-white`}>
            <Check className="w-3.5 h-3.5" /> Confirm
          </button>
          <button onClick={() => ignoreReceipt(r.id)} className={btn2}>
            <EyeOff className="w-3.5 h-3.5" /> Ignore
          </button>
          {(r.status === 'failed' || r.error || d.readBy !== 'claude') && r.status !== 'reading' && (
            <button onClick={reread} disabled={rereading} className={btn2}>
              {rereading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Read again
            </button>
          )}
          <button onClick={onDelete} className={`${btn} ml-auto text-rose-600 dark:text-rose-300 hover:bg-rose-500/10`} aria-label="Delete receipt">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>
    </article>
  );
};
