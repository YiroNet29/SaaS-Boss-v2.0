import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Image as ImageIcon, Loader2, Trash2, RotateCcw, Check, EyeOff, ExternalLink } from 'lucide-react';
import { useWorkspace, type ReceiptDraft } from '../../context/WorkspaceContext';
import { NumberField } from '../common/NumberField';
import { formatCurrency } from '../../utils/formatters';
import { describePlan, isSavableCurrency, planReceiptPayment, receiptHeadline } from '../../utils/receipts';
import type { Currency, Receipt, ServiceLink } from '../../types';
import { FALLBACK_ETB_PER_USD } from '../../utils/fx';
import { PILL, btnPrimary, btnSecondary, btnSmall, inputCls as kitInput } from '../layouts/kit';

export const CHANNEL: Record<Receipt['channel'], string> = { telegram: 'Telegram', upload: 'Uploaded', email: 'Email' };
export const READ_BY: Record<string, string> = { claude: 'Read by Claude', text: 'Read from the text', manual: 'Type in the details' };

/** Classic look: the receipt page's own classes. Kit look: the Timeline / Portfolio building blocks. */
export type ReceiptLook = 'classic' | 'kit';

const cBtn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-50';
const cBtn2 = `${cBtn} bg-stone-100 dark:bg-slate-800 border border-stone-300 dark:border-slate-700 text-stone-700 dark:text-slate-200`;
const cCard = 'rounded-2xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800';
const cMuted = 'text-stone-500 dark:text-slate-400';
const cWarn = 'text-amber-700 dark:text-amber-300';
const cPill = 'px-2 py-0.5 rounded-md';

const SKIN = {
  classic: {
    article: `${cCard} p-4 grid gap-4 md:grid-cols-[minmax(0,15rem)_1fr]`,
    pre: 'text-[11px] leading-relaxed text-stone-700 dark:text-slate-300 bg-stone-50 dark:bg-slate-950/60 border border-stone-200 dark:border-slate-800 rounded-xl p-3 max-h-56 overflow-auto whitespace-pre-wrap break-words',
    img: 'w-full max-h-56 object-contain rounded-xl border border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-950',
    fileBox: `flex flex-col items-center justify-center gap-2 h-32 rounded-xl border border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-950/60 ${cMuted} text-xs`,
    pills: 'flex flex-wrap gap-1.5 text-[10px] font-semibold',
    pillChannel: `${cPill} bg-sky-500/15 text-sky-700 dark:text-sky-300`,
    pillDate: `${cPill} bg-stone-100 dark:bg-slate-800 text-stone-600 dark:text-slate-300`,
    pillReadBy: `${cPill} bg-indigo-500/15 text-indigo-700 dark:text-indigo-300`,
    reading: 'text-xs text-stone-700 dark:text-slate-300 flex items-center gap-2',
    warn: `text-xs ${cWarn}`,
    muted: `text-xs ${cMuted}`,
    small: `text-[11px] ${cMuted}`,
    label: 'block text-xs font-semibold text-stone-600 dark:text-slate-300 mb-1',
    input:
      'w-full px-3 py-2 rounded-xl bg-stone-50 dark:bg-slate-800 border border-stone-300 dark:border-slate-700 text-sm text-stone-900 dark:text-slate-100 placeholder-stone-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-indigo-500',
    plan: 'text-xs text-stone-700 dark:text-slate-300 rounded-xl bg-stone-50 dark:bg-slate-800/60 border border-stone-200 dark:border-slate-700/60 px-3 py-2',
    planIcon: 'w-3.5 h-3.5 inline mr-1 text-emerald-400',
    error: 'text-xs text-rose-600 dark:text-rose-300',
    confirm: `${cBtn} bg-emerald-600 hover:bg-emerald-500 text-white`,
    secondary: cBtn2,
    del: `${cBtn} ml-auto text-rose-600 dark:text-rose-300 hover:bg-rose-500/10`,
    icon: 'w-3.5 h-3.5',
    fileButton: cBtn2,
  },
  kit: {
    article: 'p-5 grid gap-5 md:grid-cols-[minmax(0,13rem)_1fr] border-b border-slate-800 last:border-b-0',
    pre: 'text-xs leading-relaxed text-slate-300 bg-slate-850 border border-slate-800 rounded-xl p-3 max-h-56 overflow-auto whitespace-pre-wrap break-words',
    img: 'w-full max-h-56 object-contain rounded-xl border border-slate-800 bg-slate-950',
    fileBox: 'flex flex-col items-center justify-center gap-2 h-40 px-2 rounded-xl border border-slate-800 bg-slate-850 text-slate-400 text-sm',
    pills: 'flex flex-wrap gap-1.5',
    pillChannel: `text-xs font-semibold px-2.5 py-1 rounded-full ${PILL.free}`,
    pillDate: `text-xs font-semibold px-2.5 py-1 rounded-full ${PILL.free}`,
    pillReadBy: `text-xs font-semibold px-2.5 py-1 rounded-full ${PILL.date}`,
    reading: 'text-sm text-slate-300 flex items-center gap-2',
    warn: 'text-sm text-amber-700 dark:text-amber-400',
    muted: 'text-sm text-slate-300',
    small: 'text-xs text-slate-400',
    label: 'block text-xs font-semibold text-slate-300 mb-1',
    input: kitInput,
    plan: `text-sm rounded-xl px-3 py-2 ${PILL.date}`,
    planIcon: 'w-4 h-4 inline mr-1',
    error: 'text-sm text-rose-600 dark:text-rose-400',
    confirm: btnPrimary,
    secondary: btnSecondary,
    del: 'ml-auto inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-full text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors',
    icon: 'w-4 h-4',
    fileButton: btnSmall,
  },
} as const;

/** Opens the stored file through a short-lived private link. */
export const ReceiptFileButton: React.FC<{ receipt: Receipt; look?: ReceiptLook; className?: string }> = ({ receipt, look = 'classic', className }) => {
  const { receiptFileUrl } = useWorkspace();
  if (!receipt.mimeType || receipt.mimeType === 'text/plain') return null;
  return (
    <button
      type="button"
      onClick={async () => {
        const url = await receiptFileUrl(receipt);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
        else window.alert('The file is not available here (demo receipts have no stored file).');
      }}
      className={className ?? SKIN[look].fileButton}
    >
      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> Open file
    </button>
  );
};

const Preview: React.FC<{ receipt: Receipt; look: ReceiptLook }> = ({ receipt: r, look }) => {
  const { receiptFileUrl } = useWorkspace();
  const s = SKIN[look];
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

  if (r.textContent) return <pre className={s.pre}>{r.textContent.slice(0, 3000)}</pre>;
  if (isImage && url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img src={url} alt="Receipt" className={s.img} />
      </a>
    );
  }
  const Icon = isImage ? ImageIcon : FileText;
  return (
    <div className={s.fileBox}>
      <Icon className="w-6 h-6" />
      <span className="truncate max-w-[90%]">{r.originalName || (isImage ? 'Photo' : 'File')}</span>
      <ReceiptFileButton receipt={r} look={look} />
    </div>
  );
};

/**
 * One receipt to review: the file or text, what was read, the form (Vendor, Amount, Currency, Date paid,
 * Service, Paid with), what Confirm will do, and Confirm / Ignore / Read again / Delete.
 * `aside` shows extra lines for the chosen service (the Portfolio page says which app it goes to).
 */
export const ReceiptReviewCard: React.FC<{
  receipt: Receipt;
  onDelete: () => void;
  look?: ReceiptLook;
  aside?: (service: ServiceLink | undefined) => React.ReactNode;
}> = ({ receipt: r, onDelete, look = 'classic', aside }) => {
  const { services, products, paymentSources, payments, currentWorkspace, confirmReceipt, ignoreReceipt, rereadReceipt } = useWorkspace();
  const s = SKIN[look];
  const d = r.extracted;
  const rate = currentWorkspace.exchangeRates?.ETB_per_USD || FALLBACK_ETB_PER_USD;
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
  // Fill the form with what was read, but never over what you've already typed: the read can
  // finish (and live updates arrive) after you started filling it in.
  const [edited, setEdited] = useState(false);
  const readSignature = JSON.stringify(d) + r.status;
  useEffect(() => {
    if (!edited) setDraft(blank());
  }, [readSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof ReceiptDraft>(k: K, v: ReceiptDraft[K]) => {
    setEdited(true);
    setDraft((x) => ({ ...x, [k]: v }));
  };
  const productName = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
  const service = services.find((x) => x.id === draft.serviceLinkId);
  const today = new Date().toLocaleDateString('en-CA');
  const plan = draft.date ? planReceiptPayment({ receiptId: r.id, date: draft.date, service, payments, today }) : null;
  const foreign = d.amount !== undefined && d.currency && !isSavableCurrency(d.currency);
  const canConfirm = r.status !== 'reading' && draft.amount > 0 && Boolean(draft.date);

  const confirm = () => {
    const res = confirmReceipt(r.id, { ...draft, serviceLinkId: draft.serviceLinkId || undefined, sourceId: draft.sourceId || undefined });
    setResult(res.ok ? null : res.note);
  };
  const reread = async () => {
    setEdited(false); // you asked for a fresh read: let it fill the form
    setRereading(true);
    const res = await rereadReceipt(r.id);
    setRereading(false);
    if (!res.ok) setResult(res.error ?? 'Could not read it.');
  };

  return (
    <article aria-label={`Receipt ${receiptHeadline(d)}`} className={s.article}>
      <div className="space-y-2">
        <Preview receipt={r} look={look} />
        <div className={s.pills}>
          <span className={s.pillChannel}>{CHANNEL[r.channel]}</span>
          <span className={s.pillDate}>{r.createdAt.slice(0, 10)}</span>
          {d.readBy && <span className={s.pillReadBy}>{READ_BY[d.readBy]}</span>}
        </div>
      </div>

      <div className="space-y-3 min-w-0">
        {aside?.(service)}
        {r.status === 'reading' ? (
          <p className={s.reading}>
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> Reading the receipt…
          </p>
        ) : (
          <>
            {d.isReceipt === false && <p className={s.warn}>This doesn't look like a receipt. Ignore it, or fill it in if it is one.</p>}
            {r.error && <p className={s.warn}>{r.error}</p>}
            {d.summary && <p className={s.muted}>{d.summary}{d.invoiceNumber ? ` · #${d.invoiceNumber}` : ''}</p>}
          </>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2">
            <label className={s.label} htmlFor={`v-${r.id}`}>Vendor</label>
            <input id={`v-${r.id}`} className={s.input} value={draft.vendor ?? ''} onChange={(e) => set('vendor', e.target.value)} />
          </div>
          <div>
            <label className={s.label} htmlFor={`a-${r.id}`}>Amount</label>
            <NumberField id={`a-${r.id}`} className={s.input} value={draft.amount} onValueChange={(n) => set('amount', n)} emptyWhenZero min={0} step="0.01" />
          </div>
          <div>
            <label className={s.label} htmlFor={`c-${r.id}`}>Currency</label>
            <select id={`c-${r.id}`} className={s.input} value={draft.currency} onChange={(e) => set('currency', e.target.value as Currency)}>
              <option value="USD">USD</option>
              <option value="ETB">ETB</option>
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={s.label} htmlFor={`d-${r.id}`}>Date paid</label>
            <input id={`d-${r.id}`} type="date" className={s.input} value={draft.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div className="col-span-2 sm:col-span-2">
            <label className={s.label} htmlFor={`s-${r.id}`}>Service</label>
            <select id={`s-${r.id}`} className={s.input} value={draft.serviceLinkId} onChange={(e) => set('serviceLinkId', e.target.value)}>
              <option value="">Not linked to a service</option>
              {services
                .filter((x) => x.status !== 'cancelled' || x.id === draft.serviceLinkId)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.providerName} · {productName.get(x.productId) ?? 'no product'}
                    {x.cost ? ` (${formatCurrency(x.cost, x.currency)})` : ''}
                  </option>
                ))}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={s.label} htmlFor={`p-${r.id}`}>Paid with</label>
            <select id={`p-${r.id}`} className={s.input} value={draft.sourceId} onChange={(e) => set('sourceId', e.target.value)}>
              <option value="">Not set</option>
              {paymentSources
                .filter((x) => !x.archived)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                    {x.last4 ? ` •••• ${x.last4}` : ''}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {foreign && (
          <p className={s.warn}>
            The receipt shows {d.currency} {d.amount}. Enter what it cost in USD or birr.
          </p>
        )}
        {d.cardLast4 && !paymentSources.some((x) => x.last4 === d.cardLast4) && (
          <p className={s.small}>Charged to a card ending {d.cardLast4} that isn't in Cards & Payments yet.</p>
        )}
        {draft.currency === 'USD' && draft.amount > 0 && (
          <p className={s.small}>≈ {formatCurrency(Math.round(draft.amount * rate), 'ETB')} at today's rate</p>
        )}

        {plan && draft.amount > 0 && (
          <p className={s.plan}>
            <Check className={s.planIcon} />
            Confirm: {describePlan(plan, service?.providerName)}
          </p>
        )}
        {result && <p className={s.error}>{result}</p>}

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={confirm} disabled={!canConfirm} className={s.confirm}>
            <Check className={s.icon} /> Confirm
          </button>
          <button type="button" onClick={() => ignoreReceipt(r.id)} className={s.secondary}>
            <EyeOff className={s.icon} /> Ignore
          </button>
          {(r.status === 'failed' || r.error || d.readBy !== 'claude') && r.status !== 'reading' && (
            <button type="button" onClick={reread} disabled={rereading} className={s.secondary}>
              {rereading ? <Loader2 className={`${s.icon} animate-spin`} /> : <RotateCcw className={s.icon} />} Read again
            </button>
          )}
          <button type="button" onClick={onDelete} className={s.del} aria-label="Delete receipt">
            <Trash2 className={s.icon} /> Delete
          </button>
        </div>
      </div>
    </article>
  );
};
