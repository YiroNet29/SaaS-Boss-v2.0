import React, { useMemo, useState } from 'react';
import { Edit2 } from 'lucide-react';
import type { ImportantDate, ServiceLink } from '../../../types';
import type { ProductDetailView } from '../../products/ProductDetailView';
import { useWorkspace } from '../../../context/WorkspaceContext';
import { useAppDetail } from '../../products/useAppDetail';
import { DeleteAppDialog, DELETE_APP_MESSAGE } from '../../products/DeleteAppDialog';
import { relativeDays } from '../../../utils/summary';
import { getDaysDiff } from '../../../utils/reminders';
import { dueRows, shortDate, type TimelineMark } from '../../../utils/timeline';
import { categoryLabel, priceLabel } from '../../../utils/portfolio';
import { appAgenda, dateFacts, dateTypeLabel, dayLabel, servicePill, type AgendaItem } from '../../../utils/appPages';
import { Page, Pill, Section, btnSmall } from '../kit';
import {
  AppHead,
  AppNotFound,
  AppToolbar,
  DateButtons,
  EnvironmentsCard,
  Hint,
  MarkPaid,
  ServiceStatusPill,
  plural,
  VaultChips,
  useMarkPaid,
} from '../appParts';
import { DueLine, LineLegend } from './DueLine';

const WINDOW_DAYS = 90;

const itemId = (id: string) => `app-item-${id}`;

/** One row of "Everything, in date order": the day, what it is, and its buttons. */
const AgendaRow: React.FC<{
  id: string;
  day: React.ReactNode;
  when?: string;
  name: string;
  status?: React.ReactNode;
  sub: string;
  extra?: React.ReactNode;
  price?: string;
  pill: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ id, day, when, name, status, sub, extra, price, pill, actions }) => (
  <li
    id={itemId(id)}
    tabIndex={-1}
    className="grid grid-cols-[64px_minmax(0,1fr)] sm:grid-cols-[84px_minmax(0,1fr)_auto] gap-x-4 gap-y-2 px-5 py-4 border-b border-slate-800 last:border-b-0 focus:outline-hidden focus:bg-slate-800/50"
  >
    <span className="row-span-2 sm:row-span-1 min-w-0">
      <span className="block text-sm font-semibold text-slate-100">{day}</span>
      {when && <span className="block text-xs text-slate-400">{when}</span>}
    </span>
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-semibold text-slate-100 break-words min-w-0">{name}</span>
        {status}
      </div>
      <p className="text-xs text-slate-400 break-words">{sub}</p>
      {extra}
    </div>
    <div className="col-start-2 sm:col-start-3 flex flex-wrap items-center sm:justify-end gap-2">
      {price && <span className="text-sm font-semibold text-slate-100 tabular-nums whitespace-nowrap">{price}</span>}
      {pill}
      {actions}
    </div>
  </li>
);

/**
 * Timeline layout: one app. Its head and money, its next 90 days on a line, then its services and dates
 * together in date order; what has no date, and its environments, on the side.
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
  const { dueSoonGroups } = useWorkspace();
  const { product, prodServices, prodDates, rate, costSummary, paidYear, budget, paidWith } = useAppDetail(productId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { note, markPaid } = useMarkPaid();
  // The same "today" the due rows count their days from.
  const today = new Date().toISOString().slice(0, 10);
  const rows = useMemo(() => dueRows(dueSoonGroups, rate, WINDOW_DAYS).filter((r) => r.productId === productId), [dueSoonGroups, rate, productId]);

  if (!product) return <AppNotFound onBack={onBack} />;

  const agenda = appAgenda(prodServices, prodDates, today);

  // A mark on the line opens its service, or shows its row in the list below.
  const showItem = (id: string) => {
    const el = document.getElementById(itemId(id));
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  };
  const openMark = (m: TimelineMark) => {
    const first = m.rows[0];
    if (m.rows.length === 1 && first.service) onEditService(first.service);
    else showItem(first.id);
  };

  const editButton = (s: ServiceLink) => (
    <button type="button" onClick={() => onEditService(s)} className={btnSmall} aria-label={`Edit ${s.providerName}`} title="Edit service details">
      <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
      Edit
    </button>
  );

  const serviceRow = (i: AgendaItem, s: ServiceLink) => {
    const pill = servicePill(s, today);
    return (
      <AgendaRow
        key={i.id}
        id={i.id}
        day={dayLabel(i.date, i.daysDiff)}
        when={relativeDays(i.daysDiff)}
        name={s.providerName}
        status={<ServiceStatusPill service={s} />}
        sub={['Service', categoryLabel(s.category), s.plan, s.environmentType, paidWith(s)].filter(Boolean).join(' · ')}
        extra={<VaultChips service={s} />}
        price={priceLabel(s)}
        pill={<Pill tone={pill.tone}>{pill.label}</Pill>}
        actions={
          <>
            <MarkPaid service={s} note={note} onMark={markPaid} />
            {editButton(s)}
          </>
        }
      />
    );
  };

  const dateRow = (i: AgendaItem, d: ImportantDate) => (
    <AgendaRow
      key={i.id}
      id={i.id}
      day={dayLabel(i.date, i.daysDiff)}
      when={relativeDays(i.daysDiff)}
      name={d.title}
      status={d.status === 'snoozed' ? <Pill tone="none">Snoozed</Pill> : undefined}
      sub={`Date · ${dateTypeLabel(d.type)} · ${dateFacts(d)}`}
      pill={<Pill tone={i.daysDiff < 0 ? 'overdue' : 'date'}>{i.daysDiff < 0 ? 'Overdue' : dateTypeLabel(d.type)}</Pill>}
      actions={<DateButtons item={d} snoozeText="Snooze +7d" />}
    />
  );

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

      <Section id="app-line" title={`${product.name}'s next ${WINDOW_DAYS} days`} right={<LineLegend />} padded>
        <DueLine
          rows={rows}
          today={today}
          windowDays={WINDOW_DAYS}
          size="page"
          label={`Due in the next ${WINDOW_DAYS} days`}
          todayLabel={`Today, ${shortDate(today)}`}
          onOpen={openMark}
        />
      </Section>

      <div className="flex flex-wrap gap-6 items-start">
        <div className="flex-[999_1_620px] min-w-0">
          <Section id="app-agenda" title="Everything, in date order" right={
              <span className="text-sm text-slate-400">
                {plural(prodServices.length, 'service')} and {plural(prodDates.length, 'date')}, together
              </span>
            }>
            {agenda.dated.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">Nothing has a date yet.</p>
            ) : (
              <ul>{agenda.dated.map((i) => (i.service ? serviceRow(i, i.service) : dateRow(i, i.item!)))}</ul>
            )}

            {agenda.done.length > 0 && (
              <div className="border-t border-slate-800">
                <h3 className="px-5 pt-4 pb-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Done ({agenda.done.length})</h3>
                <ul>
                  {agenda.done.map((d) => (
                    <AgendaRow
                      key={d.id}
                      id={d.id}
                      day={dayLabel(d.dueDate, getDaysDiff(today, d.dueDate))}
                      name={d.title}
                      sub={`Date · ${dateTypeLabel(d.type)} · ${dateFacts(d)}`}
                      pill={<Pill tone="ok">Done</Pill>}
                    />
                  ))}
                </ul>
              </div>
            )}

            {!prodServices.length && (
              <Hint
                text="No services added yet. Track hosting, database, email, domains, and payment gateways for this app."
                action="Add First Service"
                onClick={() => onAddService(productId)}
              />
            )}
            {!prodDates.length && (
              <Hint text="No dates for this app yet. Track domain expiries, key rotations, and contract deadlines." action="Add Important Date" onClick={() => onAddDate(productId)} />
            )}
          </Section>
        </div>

        <div className="flex-[1_1_300px] min-w-0 space-y-6">
          {(agenda.undated.length > 0 || agenda.cancelled.length > 0) && (
            <Section id="app-no-date" title="No date">
              <ul>
                {[...agenda.undated, ...agenda.cancelled].map((s) => {
                  const pill = s.status === 'cancelled' ? { tone: 'bad' as const, label: 'Cancelled' } : servicePill(s, today);
                  return (
                    <li key={s.id} className="px-5 py-3.5 border-b border-slate-800 last:border-b-0 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-100 break-words">{s.providerName}</span>
                          <span className="block text-xs text-slate-400 break-words">
                            {[categoryLabel(s.category), s.plan, s.environmentType, paidWith(s)].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="flex flex-wrap justify-end items-center gap-2 shrink-0">
                          <Pill tone={pill.tone}>{pill.label}</Pill>
                          {editButton(s)}
                        </span>
                      </div>
                      <VaultChips service={s} />
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}
          <EnvironmentsCard environments={product.environments} services={prodServices} />
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
