import React, { useMemo, useState } from 'react';
import { useWorkspace } from '../../../context/WorkspaceContext';
import { receiptHeadline } from '../../../utils/receipts';
import { shortDate } from '../../../utils/timeline';
import { doneByMonth, paymentsWithoutReceipt, savedInMonth } from '../../../utils/receiptPages';
import type { Receipt } from '../../../types';
import { GroupLabel, Page, PageHead, Stat, TwoLine } from '../kit';
import { useReceipts } from '../../receipts/useReceipts';
import { CHANNEL } from '../../receipts/ReceiptReviewCard';
import { DoneActions, DonePill, ReceiptsAddBar, ReviewSection } from '../../receipts/ReceiptsKit';

/**
 * Timeline layout: Receipts. The ones to review are pinned on top; the done ones follow newest first,
 * one group per month (this month open, older months fold away).
 */
export const ReceiptsPage: React.FC = () => {
  const inbox = useReceipts();
  const { services, products, payments } = useWorkspace();
  const month = new Date().toLocaleDateString('en-CA').slice(0, 7);
  const groups = useMemo(() => doneByMonth(inbox.done), [inbox.done]);
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const isOpen = (m: string) => openMonths[m] ?? m === month;

  const serviceOf = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const appName = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
  const linkLine = (r: Receipt) => {
    const svc = r.serviceLinkId ? serviceOf.get(r.serviceLinkId) : undefined;
    if (svc) return `→ ${svc.providerName}${appName.get(svc.productId) ? ` · ${appName.get(svc.productId)}` : ''}`;
    return r.status === 'ignored' ? 'Not saved' : 'Not linked to a service';
  };

  return (
    <Page>
      <PageHead
        eyebrow="Receipts"
        title="Receipts, newest first"
        sub="Send them to your Telegram bot (photo, PDF or forwarded email) or add them here. They are stored privately; nothing is recorded as paid until you confirm."
        stats={
          <>
            <Stat label="To review" value={inbox.open.length} tone={inbox.open.length ? 'warn' : undefined} />
            <Stat label="Saved this month" value={savedInMonth(inbox.receipts, month)} />
            <Stat label="Payments without a receipt" value={paymentsWithoutReceipt(payments, month).length} sub="this month" />
          </>
        }
      />

      <ReceiptsAddBar inbox={inbox} />

      <ReviewSection inbox={inbox} />

      {groups.length > 0 && (
        <section aria-labelledby="done-heading" className="space-y-3">
          <GroupLabel id="done-heading">Done ({inbox.done.length})</GroupLabel>
          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
            {groups.map((g) => {
              const open = isOpen(g.month);
              const listId = `done-${g.month}`;
              return (
                <div key={g.month} className="border-b border-slate-800 last:border-b-0">
                  <h3>
                    <button
                      type="button"
                      onClick={() => setOpenMonths((x) => ({ ...x, [g.month]: !open }))}
                      aria-expanded={open}
                      aria-controls={listId}
                      className="w-full flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 py-3 text-left bg-slate-800/40 hover:bg-slate-800/70 transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="text-[15px] font-bold text-slate-100">{g.label}</span>{' '}
                        <span className="text-sm text-slate-400">{g.summary}</span>
                      </span>
                      <span className="text-sm font-semibold text-indigo-400">{open ? 'Hide ▾' : 'Show ▸'}</span>
                    </button>
                  </h3>
                  {open && (
                    <ul id={listId}>
                      {g.receipts.map((r) => (
                        <li
                          key={r.id}
                          className="grid grid-cols-[3.5rem_minmax(0,1fr)] md:grid-cols-[4rem_minmax(0,1fr)_minmax(0,11rem)_5.5rem_auto] gap-x-3 gap-y-2 items-center px-5 py-3 border-t border-slate-800"
                        >
                          <span className="text-[13px] font-semibold text-slate-200 tabular-nums">{shortDate(r.createdAt)}</span>
                          <TwoLine title={receiptHeadline(r.extracted)} sub={linkLine(r)} />
                          <span className="col-start-2 md:col-start-auto flex flex-wrap items-center gap-2 md:contents">
                            <span className="text-xs text-slate-400 min-w-0 truncate">
                              {CHANNEL[r.channel]} · {r.createdAt.slice(0, 10)}
                            </span>
                            <span>
                              <DonePill receipt={r} />
                            </span>
                          </span>
                          <span className="col-start-2 md:col-start-auto flex flex-wrap items-center gap-2 md:justify-end">
                            <DoneActions receipt={r} inbox={inbox} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </Page>
  );
};
