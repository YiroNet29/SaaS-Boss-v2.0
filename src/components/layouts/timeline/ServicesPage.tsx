import React, { useMemo } from 'react';
import type { ServiceLink } from '../../../types';
import type { ServiceListView } from '../../services/ServiceListView';
import { useServiceList, type ServiceList } from '../../services/useServiceList';
import { DeleteServiceDialog, ServiceEmptyState } from '../../services/ServiceListParts';
import { categoryLabel, priceLabel } from '../../../utils/portfolio';
import { canMarkPaid, dateCell, howItRenews, otherCurrency, planLabel, renewalGroups } from '../../../utils/serviceViews';
import { GroupLabel, Page, PageHead, Pill, Stat, TwoLine } from '../kit';
import {
  MoneyStats,
  PaidAnnouncer,
  RowActions,
  RowExtras,
  SelectionBar,
  ServiceCheck,
  ServiceToolbar,
  plural,
  useServiceTotals,
} from '../servicesKit';

type Props = React.ComponentProps<typeof ServiceListView>;

/** One service on the timeline: when, what, plan, price, how it renews, and its actions. */
const Row: React.FC<{
  list: ServiceList;
  service: ServiceLink;
  today: string;
  rate: number;
  onEdit: (s: ServiceLink) => void;
  onDuplicate: (s: ServiceLink) => void;
}> = ({ list, service: s, today, rate, onEdit, onDuplicate }) => {
  const appName = list.prodMap.get(s.productId) || 'No app';
  const when = dateCell(s, today);
  const how = howItRenews(s);
  const source = list.sourceLabel(s);
  const other = otherCurrency(s, rate);
  const selected = list.selectedIds.includes(s.id);
  return (
    <li className={`px-4 sm:px-5 py-3.5 border-b border-slate-800 last:border-b-0 ${selected ? 'bg-indigo-500/10' : ''}`}>
      <div className="flex items-start gap-3">
        <ServiceCheck list={list} service={s} label={`${s.providerName} (${appName})`} />
        <div className="flex-1 min-w-0 space-y-2">
          {/* Phones: name and price, then date and pill, then plan, then actions. Wide screens: one line. */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[88px_minmax(0,1.5fr)_minmax(0,1.2fr)_120px_136px_236px] gap-x-4 gap-y-2 items-center">
            <span className="order-3 xl:order-none min-w-0 text-[13px]">
              <span className={`font-semibold xl:block ${when.overdue ? 'text-rose-600 dark:text-rose-400' : 'text-slate-100'}`}>{when.date}</span>
              <span className="text-slate-400 xl:block xl:text-xs">
                <span className="xl:hidden"> · </span>
                {when.rel}
              </span>
            </span>
            <TwoLine
              className="order-1 xl:order-none"
              title={s.providerName}
              sub={`${appName} · ${categoryLabel(s.category)} · ${s.environmentType}`}
            />
            <span className="order-5 xl:order-none col-span-2 md:col-span-1 min-w-0">
              <span className="block text-[13px] text-slate-200 truncate">{planLabel(s)}</span>
              {source && <span className="block text-xs text-slate-400 truncate">Paid with {source}</span>}
            </span>
            <span className="order-2 xl:order-none text-right xl:text-left tabular-nums">
              <span className="block text-sm font-semibold text-slate-100 whitespace-nowrap">{priceLabel(s)}</span>
              {other && <span className="block text-xs text-slate-400 whitespace-nowrap">{other}</span>}
            </span>
            <Pill tone={how.tone} className="order-4 xl:order-none justify-self-end xl:justify-self-start">
              {how.label}
            </Pill>
            <RowActions
              list={list}
              service={s}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              className="order-6 xl:order-none col-span-2 md:col-span-1 md:justify-end"
            />
          </div>
          <RowExtras list={list} service={s} />
        </div>
      </div>
    </li>
  );
};

/** Timeline layout: Services, grouped by when they renew (overdue first, free and stopped ones last). */
export const ServicesPage: React.FC<Props> = ({ initialSearch = '', onAddService, onEditService, onDuplicateService, onOpenBulkEdit }) => {
  const list = useServiceList(initialSearch);
  const totals = useServiceTotals();
  const { today, rate } = totals;
  const groups = useMemo(() => renewalGroups(list.filteredServices, today), [list.filteredServices, today]);
  const byHand = useMemo(() => list.services.filter(canMarkPaid).length, [list.services]);

  return (
    <Page>
      <PageHead
        eyebrow="Services"
        title={`${plural(list.services.length, 'service')}, by when they renew`}
        sub="Everything your apps pay for, soonest renewal first."
        stats={
          <>
            <MoneyStats totals={totals} />
            <Stat label="Renew by hand" value={byHand} />
          </>
        }
      />

      <div className="space-y-3">
        <ServiceToolbar list={list} onAddService={onAddService} onOpenBulkEdit={onOpenBulkEdit} appFilter />
        <SelectionBar list={list} />
      </div>

      {list.filteredServices.length === 0 ? (
        <ServiceEmptyState list={list} onAddService={onAddService} />
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-labelledby={`services-${g.key}`} className="space-y-2.5">
            <GroupLabel id={`services-${g.key}`} tone={g.key === 'overdue' ? 'bad' : undefined}>
              {g.label}
            </GroupLabel>
            <ul className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
              {g.services.map((s) => (
                <Row key={s.id} list={list} service={s} today={today} rate={rate} onEdit={onEditService} onDuplicate={onDuplicateService} />
              ))}
            </ul>
          </section>
        ))
      )}

      <PaidAnnouncer list={list} />
      <DeleteServiceDialog list={list} />
    </Page>
  );
};
