import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { ServiceLink } from '../../../types';
import type { ServiceListView } from '../../services/ServiceListView';
import { useServiceList, type ServiceList } from '../../services/useServiceList';
import { DeleteServiceDialog, ServiceEmptyState } from '../../services/ServiceListParts';
import { categoryLabel, priceLabel } from '../../../utils/portfolio';
import { appCards, appStatus, countLabel, listNames, planLabel, providerCards, sharedProviderCount, whenPill } from '../../../utils/serviceViews';
import { Page, PageHead, Pill, Segmented, Stat, TwoLine, linkCls } from '../kit';
import {
  MoneyStats,
  PaidAnnouncer,
  RowActions,
  RowExtras,
  SelectionBar,
  ServiceCheck,
  ServiceToolbar,
  plural,
  usd,
  useServiceTotals,
} from '../servicesKit';

type Props = React.ComponentProps<typeof ServiceListView> & {
  /** Opens Add Service with this app picked. Without it, "Add a service to <app>" opens plain Add Service. */
  onAddServiceTo?: (productId: string) => void;
};

type View = 'app' | 'provider';
const VIEWS: { value: View; label: string }[] = [
  { value: 'app', label: 'By app' },
  { value: 'provider', label: 'By provider' },
];

/** One service in an app's (or a provider's) card: name, plan, price, when and how it renews, actions. */
const Row: React.FC<{
  list: ServiceList;
  service: ServiceLink;
  /** The provider in an app's card; the app in a provider's card. */
  title: string;
  today: string;
  onEdit: (s: ServiceLink) => void;
  onDuplicate: (s: ServiceLink) => void;
}> = ({ list, service: s, title, today, onEdit, onDuplicate }) => {
  const appName = list.prodMap.get(s.productId) || 'No app';
  const pill = whenPill(s, today);
  const source = list.sourceLabel(s);
  const selected = list.selectedIds.includes(s.id);
  return (
    <li className={`px-4 sm:px-5 py-3.5 border-b border-slate-800 last:border-b-0 ${selected ? 'bg-indigo-500/10' : ''}`}>
      <div className="flex items-start gap-3">
        <ServiceCheck list={list} service={s} label={`${s.providerName} (${appName})`} />
        <div className="flex-1 min-w-0 space-y-2">
          {/* Phones: name and price, then plan and pill, then actions. Wide screens: one line. */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_120px_160px_236px] gap-x-4 gap-y-2 items-center">
            <TwoLine className="order-1 xl:order-none" title={title} sub={`${categoryLabel(s.category)} · ${s.environmentType}`} />
            <span className="order-3 xl:order-none min-w-0">
              <span className="block text-[13px] text-slate-200 truncate">{planLabel(s)}</span>
              {source && <span className="block text-xs text-slate-400 truncate">Paid with {source}</span>}
            </span>
            <span className="order-2 xl:order-none text-right xl:text-left text-sm font-semibold text-slate-100 whitespace-nowrap tabular-nums">{priceLabel(s)}</span>
            <Pill tone={pill.tone} className="order-4 xl:order-none justify-self-end xl:justify-self-start">
              {pill.label}
            </Pill>
            <RowActions list={list} service={s} onEdit={onEdit} onDuplicate={onDuplicate} className="order-5 xl:order-none col-span-2 xl:col-span-1 xl:justify-end" />
          </div>
          <RowExtras list={list} service={s} />
        </div>
      </div>
    </li>
  );
};

/** A card: its heading line, an optional link on the right, and its rows. */
const Card: React.FC<{ id: string; heading: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }> = ({ id, heading, right, children }) => (
  <section aria-labelledby={id} className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 border-b border-slate-800">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">{heading}</div>
      {right}
    </div>
    {children}
  </section>
);

/** Portfolio layout: Services, one card per app (or per provider, to see what several apps share). */
export const ServicesPage: React.FC<Props> = ({
  initialSearch = '',
  onAddService,
  onAddServiceTo,
  onEditService,
  onDuplicateService,
  onOpenBulkEdit,
}) => {
  const list = useServiceList(initialSearch);
  const totals = useServiceTotals();
  const { today, rate } = totals;
  const [view, setView] = useState<View>('app');

  const { services, products, filteredServices, filtersOn } = list;
  const apps = useMemo(
    () => (view === 'app' ? appCards(products, services, filteredServices, today, rate, !filtersOn) : []),
    [view, products, services, filteredServices, today, rate, filtersOn]
  );
  const providers = useMemo(
    () => (view === 'provider' ? providerCards(products, services, filteredServices, today, rate) : []),
    [view, products, services, filteredServices, today, rate]
  );
  const shared = useMemo(() => sharedProviderCount(services, products.length, rate), [services, products.length, rate]);
  const appCount = useMemo(() => new Set(services.map((s) => s.productId)).size, [services]);
  const addTo = (productId: string) => (onAddServiceTo ? onAddServiceTo(productId) : onAddService());

  const row = (s: ServiceLink, title: string) => (
    <Row key={s.id} list={list} service={s} title={title} today={today} onEdit={onEditService} onDuplicate={onDuplicateService} />
  );

  return (
    <Page>
      <PageHead
        eyebrow="Services"
        title={`${plural(services.length, 'service')} in ${plural(appCount, 'app')}`}
        sub="Everything each app pays for, app by app."
        stats={
          <>
            <MoneyStats totals={totals} />
            <Stat label="Shared providers" value={shared} />
          </>
        }
      />

      <div className="space-y-3">
        <ServiceToolbar
          list={list}
          onAddService={onAddService}
          onOpenBulkEdit={onOpenBulkEdit}
          lead={<Segmented<View> label="Group services" value={view} onChange={setView} options={VIEWS} />}
        />
        <SelectionBar list={list} />
      </div>

      {filteredServices.length === 0 ? (
        <ServiceEmptyState list={list} onAddService={onAddService} />
      ) : view === 'app' ? (
        apps.map((c, i) => {
          const id = `services-app-${c.product?.id ?? `none-${i}`}`;
          const status = c.product ? appStatus(c.product.status) : null;
          return (
            <Card
              key={id}
              id={id}
              heading={
                <>
                  <h2 id={id} className="text-xl font-bold text-slate-100 min-w-0 break-words">
                    {c.name}
                  </h2>
                  {status && <Pill tone={status.tone}>{status.label}</Pill>}
                  <span className="text-sm text-slate-300">
                    {c.monthlyUsd !== undefined ? `${usd(c.monthlyUsd)} a month · ` : ''}
                    {countLabel(c.services.length, c.total)}
                  </span>
                </>
              }
              right={
                c.product && (
                  <button type="button" onClick={() => addTo(c.product!.id)} className={`inline-flex items-center gap-1.5 min-h-[32px] text-left ${linkCls}`}>
                    <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
                    Add a service to {c.name}
                  </button>
                )
              }
            >
              {c.services.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-400">No services yet.</p>
              ) : (
                <ul>{c.services.map((s) => row(s, s.providerName))}</ul>
              )}
            </Card>
          );
        })
      ) : (
        providers.map((p, i) => {
          const id = `services-provider-${i}`;
          return (
            <Card
              key={p.name}
              id={id}
              heading={
                <>
                  <h2 id={id} className="text-xl font-bold text-slate-100 min-w-0 break-words">
                    {p.name}
                  </h2>
                  {p.apps.length > 1 && <Pill tone="date">Shared</Pill>}
                  <span className="text-sm text-slate-300">
                    Used by {listNames(p.apps)} · {usd(p.monthlyUsd)} a month · {countLabel(p.services.length, p.total)}
                  </span>
                </>
              }
            >
              <ul>{p.services.map((s) => row(s, list.prodMap.get(s.productId) || 'No app'))}</ul>
            </Card>
          );
        })
      )}

      <PaidAnnouncer list={list} />
      <DeleteServiceDialog list={list} />
    </Page>
  );
};
