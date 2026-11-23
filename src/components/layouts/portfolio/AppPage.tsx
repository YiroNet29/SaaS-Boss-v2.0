import React, { useState } from 'react';
import { Calendar, Edit2, Link2, Plus, Server } from 'lucide-react';
import type { ProductDetailView } from '../../products/ProductDetailView';
import { useWorkspace } from '../../../context/WorkspaceContext';
import { useAppDetail } from '../../products/useAppDetail';
import { DeleteAppDialog, DELETE_APP_MESSAGE } from '../../products/DeleteAppDialog';
import { EmptyState } from '../../common/EmptyState';
import { formatCurrency } from '../../../utils/formatters';
import { getDaysDiff } from '../../../utils/reminders';
import { categoryLabel, priceLabel, serviceLine } from '../../../utils/portfolio';
import {
  appAgenda,
  appPayments,
  dateDetail,
  dateTypeLabel,
  dayLabel,
  effectiveDate,
  groupByCategory,
  planText,
  sharedProviderNote,
} from '../../../utils/appPages';
import { Page, Pill, Section } from '../kit';
import {
  AppHead,
  AppNotFound,
  AppToolbar,
  DateButtons,
  EnvironmentsCard,
  MarkPaid,
  ServiceStatusPill,
  VaultChips,
  useMarkPaid,
} from '../appParts';

const PAYMENTS_SHOWN = 6;

/**
 * Portfolio layout: one app. Its head, budget and buttons; its services as tiles grouped by what they do
 * (with a note when another app uses the same provider); its dates, environments and recent payments.
 */
export const AppPage: React.FC<React.ComponentProps<typeof ProductDetailView>> = ({
  productId,
  onBack,
  onEditProduct,
  onCloneProduct,
  onAddService,
  onEditService,
  onAddDate,
}) => {
  const { products, services, payments, paymentSources } = useWorkspace();
  const { product, prodServices, prodDates, costSummary, paidYear, budget, paidWith } = useAppDetail(productId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { note, markPaid } = useMarkPaid();
  const today = new Date().toISOString().slice(0, 10);

  if (!product) return <AppNotFound onBack={onBack} />;

  // Tiles in category order (the order each category first appears, as on the Classic page).
  const groups = groupByCategory(prodServices);
  // Open dates by day, then those already done.
  const agenda = appAgenda([], prodDates, today);
  const datesInOrder = [...agenda.dated.map((i) => i.item!), ...agenda.done];
  const recent = appPayments(payments, new Set(prodServices.map((s) => s.id)), PAYMENTS_SHOWN);
  const serviceName = (id?: string) => prodServices.find((s) => s.id === id)?.providerName ?? 'Service';
  const sourceName = (id?: string) => paymentSources.find((x) => x.id === id)?.name;

  return (
    <Page>
      <AppHead product={product} costSummary={costSummary} paidYear={paidYear} onBack={onBack} />
      <AppToolbar
        budget={budget}
        onClone={() => onCloneProduct(product)}
        onEdit={() => onEditProduct(product)}
        onDelete={() => setDeleteOpen(true)}
        onAddDate={() => onAddDate(productId)}
        onAddService={() => onAddService(productId)}
      />

      {/* Services as tiles, grouped by what they do */}
      <section aria-labelledby="app-services-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="app-services-heading" className="text-xl font-bold text-slate-100">
            Services <span className="text-base font-normal text-slate-400">({prodServices.length})</span>
          </h2>
          <p className="text-sm text-slate-400">Grouped by what they do</p>
        </div>

        {!prodServices.length ? (
          <EmptyState
            icon={Server}
            title="No services added yet"
            description="Track hosting, database, email, domains, and payment gateways for this app."
            actionLabel="Add First Service"
            onAction={() => onAddService(productId)}
          />
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {groups.flatMap(([category, items]) =>
              items.map((s) => {
                const line = serviceLine(s, today);
                const shared = sharedProviderNote(s, services, products);
                const by = paidWith(s);
                return (
                  <li key={s.id} className="min-w-0 rounded-2xl bg-slate-900 border border-slate-800 px-4 py-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400 truncate">
                        {categoryLabel(category)}
                        {items.length > 1 ? ` · ${items.length}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => onEditService(s)}
                        className="inline-flex items-center gap-1 min-h-[32px] px-2 rounded-full text-xs font-semibold text-slate-300 hover:text-slate-100 hover:bg-slate-800"
                        aria-label={`Edit ${s.providerName}`}
                        title="Edit service details"
                      >
                        <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                        Edit
                      </button>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-[17px] font-bold text-slate-100 break-words min-w-0">{s.providerName}</h3>
                      <span className="text-sm font-semibold text-slate-100 tabular-nums whitespace-nowrap">{priceLabel(s)}</span>
                    </div>
                    <p className="text-sm text-slate-300 break-words">{planText(s, today)}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {s.status !== 'cancelled' && <Pill tone={line.tone}>{line.when}</Pill>}
                      <ServiceStatusPill service={s} />
                      {by && <span className="text-xs text-slate-400 break-words">{by}</span>}
                    </div>
                    {shared && (
                      <p className="flex items-start gap-1.5 text-xs text-slate-300">
                        <Link2 className="w-3.5 h-3.5 mt-px shrink-0 text-indigo-400" aria-hidden="true" />
                        {shared}
                      </p>
                    )}
                    <VaultChips service={s} />
                    <div className="flex flex-wrap items-center gap-2 empty:hidden">
                      <MarkPaid service={s} note={note} onMark={markPaid} />
                    </div>
                  </li>
                );
              })
            )}
            <li className="min-w-0">
              <button
                type="button"
                onClick={() => onAddService(productId)}
                className="w-full h-full min-h-[120px] rounded-2xl border-2 border-dashed border-slate-700 hover:bg-slate-800/40 flex items-center justify-center gap-2 px-4 text-sm font-semibold text-indigo-400 hover:text-indigo-300"
              >
                <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="break-words">Add a service to {product.name}</span>
              </button>
            </li>
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-6 items-start">
        {/* Dates */}
        <div className="flex-[1_1_460px] min-w-0">
          <Section id="app-dates" title={`Milestones & dates (${prodDates.length})`}>
            {!prodDates.length ? (
              <div className="px-5">
                <EmptyState
                  icon={Calendar}
                  title="No dates for this app yet"
                  description="Track domain expiries, key rotations, and contract deadlines."
                  actionLabel="Add Important Date"
                  onAction={() => onAddDate(productId)}
                />
              </div>
            ) : (
              <ul>
                {datesInOrder.map((d) => {
                  const day = d.status === 'done' ? d.dueDate : effectiveDate(d);
                  const diff = getDaysDiff(today, day);
                  const late = d.status !== 'done' && diff < 0;
                  return (
                    <li
                      key={d.id}
                      className="grid grid-cols-[64px_minmax(0,1fr)] sm:grid-cols-[72px_minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-5 py-3.5 border-b border-slate-800 last:border-b-0"
                    >
                      <span className="row-span-2 sm:row-span-1 text-sm font-semibold text-slate-100">{dayLabel(day, diff)}</span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-100 break-words min-w-0">{d.title}</span>
                          {d.status === 'snoozed' && <Pill tone="none">Snoozed</Pill>}
                        </span>
                        <span className="block text-xs text-slate-400 break-words">{dateDetail(d, today)}</span>
                      </span>
                      <span className="col-start-2 sm:col-start-3 flex flex-wrap items-center sm:justify-end gap-2">
                        {d.status === 'done' ? (
                          <Pill tone="ok">Done</Pill>
                        ) : (
                          <Pill tone={late ? 'overdue' : 'date'}>{late ? 'Overdue' : dateTypeLabel(d.type)}</Pill>
                        )}
                        <DateButtons item={d} snoozeText="+7d" />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        {/* Environments and what was paid */}
        <div className="flex-[1_1_360px] min-w-0 space-y-6">
          <EnvironmentsCard environments={product.environments} services={prodServices} />
          <Section id="app-payments" title={`Paid for ${product.name}`}>
            {recent.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">No payments for this app yet.</p>
            ) : (
              <ul>
                {recent.map((p) => {
                  const from = sourceName(p.sourceId);
                  return (
                    <li key={p.id} className="grid grid-cols-[72px_minmax(0,1fr)_auto] gap-3 items-baseline px-5 py-3 border-b border-slate-800 last:border-b-0">
                      <span className="text-sm text-slate-300">{dayLabel(p.paidOn, getDaysDiff(today, p.paidOn))}</span>
                      <span className="text-sm text-slate-200 min-w-0 break-words">
                        {serviceName(p.serviceLinkId)}
                        {from && <span className="text-slate-400"> · {from}</span>}
                      </span>
                      <span className="text-sm font-semibold text-slate-100 tabular-nums whitespace-nowrap">{formatCurrency(p.amount, p.currency)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <DeleteAppDialog
        product={deleteOpen ? product : null}
        message={DELETE_APP_MESSAGE.page}
        onClose={() => setDeleteOpen(false)}
        onDeleted={onBack}
      />
    </Page>
  );
};
