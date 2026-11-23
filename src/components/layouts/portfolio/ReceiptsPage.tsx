import React, { useMemo, useState } from 'react';
import { useWorkspace } from '../../../context/WorkspaceContext';
import { receiptHeadline } from '../../../utils/receipts';
import { shortDate } from '../../../utils/timeline';
import { doneByApp, missingReceiptsByApp, monthLabel, receiptDay, receiptMonths, savedInMonth } from '../../../utils/receiptPages';
import type { Receipt, ServiceLink } from '../../../types';
import { Page, PageHead, Pill, SelectChip, Stat, TwoLine } from '../kit';
import { useReceipts } from '../../receipts/useReceipts';
import { CHANNEL } from '../../receipts/ReceiptReviewCard';
import { DoneActions, DonePill, ReceiptsAddBar, ReviewSection } from '../../receipts/ReceiptsKit';

/**
 * Portfolio layout: Receipts. The ones to review on top (each says which app it will go to), then the
 * done ones in a column per app, with a note when one of the app's payments this month has no receipt.
 */
export const ReceiptsPage: React.FC = () => {
  const inbox = useReceipts();
  const { services, products, payments } = useWorkspace();
  const thisMonth = new Date().toLocaleDateString('en-CA').slice(0, 7);

  const months = useMemo(() => receiptMonths(inbox.done), [inbox.done]);
  const [picked, setPicked] = useState<string | null>(null);
  const month =
    picked && (picked === 'all' || months.includes(picked)) ? picked : months.includes(thisMonth) ? thisMonth : (months[0] ?? 'all');

  const missing = useMemo(() => missingReceiptsByApp(payments, services, inbox.open, thisMonth), [payments, services, inbox.open, thisMonth]);
  const columns = useMemo(() => doneByApp(inbox.done, services, products, month, missing), [inbox.done, services, products, month, missing]);

  const serviceOf = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const appName = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
  const goesTo = (svc: ServiceLink | undefined) => {
    const app = svc ? appName.get(svc.productId) : undefined;
    return app ? (
      <p>
        <Pill tone="date">Will go to {app}</Pill>
      </p>
    ) : (
      <p className="text-sm text-slate-400">Choose a service to file it under one of your apps.</p>
    );
  };
  const detail = (r: Receipt) => {
    const svc = r.serviceLinkId ? serviceOf.get(r.serviceLinkId) : undefined;
    const what = svc ? svc.providerName : r.status === 'ignored' ? 'Not saved' : 'Not linked to a service';
    return `${what} · ${CHANNEL[r.channel]} · ${receiptDay(r)}`;
  };
  const monthOptions = [...months.map((m) => ({ value: m, label: monthLabel(m) })), { value: 'all', label: 'All months' }];

  return (
    <Page>
      <PageHead
        eyebrow="Receipts"
        title="Receipts, app by app"
        sub="Send them to your Telegram bot (photo, PDF or forwarded email) or add them here. They are stored privately; nothing is recorded as paid until you confirm."
        stats={
          <>
            <Stat label="To review" value={inbox.open.length} tone={inbox.open.length ? 'warn' : undefined} />
            <Stat label="Saved this month" value={savedInMonth(inbox.receipts, thisMonth)} />
          </>
        }
      />

      <ReceiptsAddBar inbox={inbox} />

      <ReviewSection inbox={inbox} aside={goesTo} />

      {(inbox.done.length > 0 || columns.length > 0) && (
        <section aria-labelledby="done-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="done-heading" className="text-xl font-bold text-slate-100">
              Done ({inbox.done.length}){month !== 'all' ? ` · ${monthLabel(month)}` : ''}
            </h2>
            {months.length > 0 && <SelectChip label="Month" value={month} onChange={setPicked} options={monthOptions} />}
          </div>
          {columns.length === 0 ? (
            <p className="text-sm text-slate-400">No done receipts in {monthLabel(month)}.</p>
          ) : (
            <div className="flex flex-wrap gap-4 items-start">
              {columns.map((c) => {
                const headingId = `rcpt-app-${c.productId ?? 'none'}`;
                return (
                  <section
                    key={c.productId ?? 'none'}
                    aria-labelledby={headingId}
                    className="flex-[1_1_270px] min-w-0 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4 border-b border-slate-800">
                      <h3 id={headingId} className="text-lg font-bold text-slate-100 min-w-0 truncate">
                        {c.name}
                      </h3>
                      <span className="text-sm text-slate-400">
                        {c.receipts.length} {c.receipts.length === 1 ? 'receipt' : 'receipts'}
                      </span>
                    </div>
                    {c.receipts.length > 0 && (
                      <ul>
                        {c.receipts.map((r) => (
                          <li key={r.id} className="px-5 py-3 border-b border-slate-800 last:border-b-0 space-y-2">
                            <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 items-baseline">
                              <span className="text-[13px] font-semibold text-slate-200 tabular-nums">{shortDate(r.createdAt)}</span>
                              <TwoLine title={receiptHeadline(r.extracted)} sub={detail(r)} />
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pl-[3.25rem] ml-3">
                              <DonePill receipt={r} />
                              <span className="ml-auto flex flex-wrap items-center gap-2">
                                <DoneActions receipt={r} inbox={inbox} />
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {c.missing.length > 0 && (
                      <ul className="px-5 py-3 border-t border-slate-800 space-y-1" aria-label={`Payments this month with no receipt for ${c.name}`}>
                        {c.missing.map((m, i) => (
                          <li key={`${i}-${m}`} className="text-sm text-amber-700 dark:text-amber-400">
                            {m}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </section>
      )}
    </Page>
  );
};
