import React, { useMemo } from 'react';
import { Copy, Edit2, Layers, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { ProductListView } from '../../products/ProductListView';
import { useWorkspace } from '../../../context/WorkspaceContext';
import { NO_MATCH_TEXT, useAppList } from '../../products/useAppList';
import { DeleteAppDialog, DELETE_APP_MESSAGE } from '../../products/DeleteAppDialog';
import { EmptyState } from '../../common/EmptyState';
import { formatCurrency } from '../../../utils/formatters';
import { dueRows, shortDate, withTrialEnds, type DueRow } from '../../../utils/timeline';
import { siteName } from '../../../utils/portfolio';
import {
  APP_STATUSES,
  appTotals,
  nextCharge,
  overdueText,
  sortByNextDue,
  statusLabel,
  statusTone,
} from '../../../utils/appPages';
import { Chip, Page, PageHead, Pill, SearchBox, Section, SelectChip, Stat, Toolbar, btnPrimary, btnSecondary } from '../kit';
import { DueLine, LineLegend } from './DueLine';

const WINDOW_DAYS = 90;
/** Rows this far ahead still count when sorting apps by what's next. */
const SORT_DAYS = 3650;

const usd = (n: number) => formatCurrency(Math.round(n * 100) / 100, 'USD');
const etb = (n: number) => formatCurrency(Math.round(n), 'ETB');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const rowAction =
  'inline-flex items-center gap-1 min-h-[32px] px-2 rounded-full text-xs font-semibold text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition-colors';

/** Timeline layout: every app as a row with its own next-90-days line, the app with the soonest thing due first. */
export const AppsPage: React.FC<React.ComponentProps<typeof ProductListView>> = ({
  onSelectProduct,
  onOpenCreateModal,
  onOpenTemplatePicker,
  onEditProduct,
  onCloneProduct,
}) => {
  const { dueSoonGroups, overdueCount, totalCosts, todayStr } = useWorkspace();
  const {
    products,
    services,
    dates,
    rate,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    tagFilter,
    setTagFilter,
    tags,
    counts,
    filteredProducts,
    filtering,
    productToDelete,
    setProductToDelete,
  } = useAppList();
  // The same "today" the due rows count their days from.
  const today = todayStr;

  const allRows = useMemo(
    () => withTrialEnds(dueRows(dueSoonGroups, rate, SORT_DAYS), services, products, today, SORT_DAYS),
    [dueSoonGroups, rate, services, products, today]
  );
  const rowsByApp = useMemo(() => {
    const map = new Map<string, DueRow[]>();
    for (const r of allRows) {
      if (!r.productId) continue;
      if (!map.has(r.productId)) map.set(r.productId, []);
      map.get(r.productId)!.push(r);
    }
    return map;
  }, [allRows]);
  const next = nextCharge(allRows.filter((r) => r.daysDiff >= 0));
  const sorted = sortByNextDue(filteredProducts, allRows);

  return (
    <Page>
      <PageHead
        eyebrow="Apps"
        title="Your apps, by what's next"
        sub="Each app with its next 90 days. Click an app to open its page."
        stats={
          <>
            <Stat label="This month" value={usd(totalCosts.totalUsd)} sub={etb(totalCosts.totalEtb)} className="col-span-2" />
            <Stat label="Next charge" value={next ? next.name : 'None'} sub={next ? shortDate(next.dueDate) : undefined} />
            <Stat label="Overdue" value={overdueCount ? plural(overdueCount, 'item') : 'None'} tone={overdueCount ? 'bad' : 'ok'} />
          </>
        }
      />

      <Toolbar
        left={
          <>
            <SearchBox value={search} onChange={setSearch} placeholder="Search apps, tags…" label="Search apps" />
            <div className="flex flex-wrap gap-2" role="group" aria-label="Show apps by status">
              {(['all', ...APP_STATUSES] as const).map((st) => (
                <Chip key={st} active={statusFilter === st} onClick={() => setStatusFilter(st)}>
                  {st === 'all' ? 'All' : statusLabel(st)}
                  {counts[st] > 0 && <span className="tabular-nums">{counts[st]}</span>}
                </Chip>
              ))}
            </div>
            {tags.length > 0 && <SelectChip value={tagFilter} onChange={setTagFilter} options={tags} label="Show apps by tag" />}
          </>
        }
        right={
          <>
            <button type="button" onClick={onOpenTemplatePicker} className={btnSecondary}>
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              Use a template
            </button>
            <button type="button" onClick={onOpenCreateModal} className={btnPrimary}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              Add app
            </button>
          </>
        }
      />

      {!sorted.length ? (
        <EmptyState
          icon={Layers}
          title={filtering ? 'No apps found' : 'No apps yet'}
          description={
            filtering
              ? NO_MATCH_TEXT
              : 'Add an app you run (e.g. SaaS Boss), then add what it pays for: hosting, domain, database…'
          }
          actionLabel="Add App"
          onAction={onOpenCreateModal}
          secondaryActionLabel="Pick Starter Template"
          onSecondaryAction={onOpenTemplatePicker}
        />
      ) : (
        <Section id="apps-by-date" title="Sorted by the soonest thing due" right={<LineLegend />}>
          <ul>
            {sorted.map((p) => {
              const totals = appTotals(p.id, services, dates, rate);
              const rows = rowsByApp.get(p.id) ?? [];
              const late = overdueText(rows);
              const site = siteName(p.liveUrl);
              const headingId = `app-row-${p.id}`;
              return (
                <li
                  key={p.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[220px_minmax(0,1fr)_170px] gap-x-5 gap-y-3 px-5 py-5 border-b border-slate-800 last:border-b-0"
                >
                  {/* Name, status, site, tags */}
                  <div className="col-start-1 row-start-1 lg:row-span-2 min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 id={headingId} className="text-2xl font-bold text-slate-100 min-w-0 break-words">
                        <button type="button" onClick={() => onSelectProduct(p.id)} className="text-left hover:underline">
                          {p.name}
                        </button>
                      </h3>
                      <Pill tone={statusTone(p.status)}>{statusLabel(p.status)}</Pill>
                    </div>
                    {site && <p className="text-sm text-slate-400 truncate">{site}</p>}
                    <p className="text-sm text-slate-300 line-clamp-2">{p.description || 'No description provided.'}</p>
                    {p.tags?.length > 0 && <p className="text-sm text-slate-300 break-words">{p.tags.map((t) => `#${t}`).join(' ')}</p>}
                    {late && <Pill tone="overdue">{late}</Pill>}
                  </div>

                  {/* Cost and counts */}
                  <div className="col-start-2 row-start-1 lg:col-start-3 text-right space-y-1">
                    <p className="text-[22px] font-semibold text-slate-100 tabular-nums whitespace-nowrap">
                      {formatCurrency(totals.monthlyUsd, 'USD')}
                      <span className="text-sm font-normal text-slate-400">/mo</span>
                    </p>
                    <p className="text-sm text-slate-400 tabular-nums whitespace-nowrap">{formatCurrency(totals.monthlyEtb, 'ETB')}</p>
                    <p className="text-sm text-slate-300">
                      {plural(totals.services.length, 'service')} · {plural(totals.openDates.length, 'date')}
                    </p>
                  </div>

                  {/* Its next 90 days */}
                  <div className="col-span-2 row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:row-span-2 min-w-0">
                    <DueLine
                      rows={rows}
                      today={today}
                      windowDays={WINDOW_DAYS}
                      size="row"
                      label={`${p.name}: due in the next ${WINDOW_DAYS} days`}
                      openLabel={`Open ${p.name}`}
                      onOpen={() => onSelectProduct(p.id)}
                    />
                  </div>

                  {/* Copy, Edit, Delete */}
                  <div className="col-span-2 row-start-3 lg:col-span-1 lg:col-start-3 lg:row-start-2 flex flex-wrap justify-end items-end gap-1">
                    <button type="button" onClick={() => onCloneProduct(p)} className={rowAction} aria-label={`Copy ${p.name}`} title="Clone Product">
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      Copy
                    </button>
                    <button type="button" onClick={() => onEditProduct(p)} className={rowAction} aria-label={`Edit ${p.name}`} title="Edit Product">
                      <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductToDelete(p)}
                      className={`${rowAction} hover:text-rose-600 dark:hover:text-rose-400`}
                      aria-label={`Delete ${p.name}`}
                      title="Delete Product"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <DeleteAppDialog product={productToDelete} message={DELETE_APP_MESSAGE.list} onClose={() => setProductToDelete(null)} />
    </Page>
  );
};
