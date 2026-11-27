import React, { useMemo } from 'react';
import { Copy, Edit2, ExternalLink, Layers, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { Product } from '../../../types';
import type { ProductListView } from '../../products/ProductListView';
import { useWorkspace } from '../../../context/WorkspaceContext';
import { NO_MATCH_TEXT, useAppList } from '../../products/useAppList';
import { DeleteAppDialog, DELETE_APP_MESSAGE } from '../../products/DeleteAppDialog';
import { EmptyState } from '../../common/EmptyState';
import { formatCurrency } from '../../../utils/formatters';
import { budgetUse, paidByAppInMonth, type BudgetUse } from '../../../utils/budgets';
import { paidInLastYear } from '../../../utils/reports';
import { dueRows, shortDate, withTrialEnds, type DueRow } from '../../../utils/timeline';
import { budgetLine, siteName } from '../../../utils/portfolio';
import {
  APP_STATUSES,
  appTotals,
  chargeText,
  nextCharge,
  openDatesSummary,
  paidWithNames,
  servicesSummary,
  statusLabel,
  statusTone,
  type AppTotals,
  type OpenDates,
} from '../../../utils/appPages';
import { Bar, Chip, PILL, Page, PageHead, Pill, SearchBox, SelectChip, Stat, Toolbar, btnPrimary, btnSecondary } from '../kit';

/** Rows this far ahead still count for "Next charge". */
const AHEAD_DAYS = 3650;

const usd = (n: number) => formatCurrency(Math.round(n * 100) / 100, 'USD');
const etb = (n: number) => formatCurrency(Math.round(n), 'ETB');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const action =
  'inline-flex items-center gap-1 min-h-[32px] px-2.5 rounded-full text-xs font-semibold text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition-colors';

/** Everything the comparison shows for one app. */
interface Column {
  product: Product;
  totals: AppTotals;
  site: string;
  budget: BudgetUse | null;
  next?: DueRow;
  dates: OpenDates;
  paidWith: string[];
  paidYear: { usd: number; count: number };
}

/**
 * Portfolio layout: the apps side by side, one column each, with what they cost, their budget, what they
 * run on and what's next. On a phone each app becomes its own card.
 */
export const AppsPage: React.FC<React.ComponentProps<typeof ProductListView>> = ({
  onSelectProduct,
  onOpenCreateModal,
  onOpenTemplatePicker,
  onEditProduct,
  onCloneProduct,
}) => {
  const { dueSoonGroups, totalCosts, payments, paymentSources, todayStr } = useWorkspace();
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

  const rows = useMemo(
    () => withTrialEnds(dueRows(dueSoonGroups, rate, AHEAD_DAYS), services, products, today, AHEAD_DAYS),
    [dueSoonGroups, rate, services, products, today]
  );
  const paidThisMonth = useMemo(() => paidByAppInMonth(payments, services, today.slice(0, 7), rate), [payments, services, today, rate]);
  const budgetsSet = products.filter((p) => budgetUse(p.monthlyBudget, 0)).length;

  const columns: Column[] = filteredProducts.map((product) => {
    const totals = appTotals(product.id, services, dates, rate);
    return {
      product,
      totals,
      site: siteName(product.liveUrl),
      budget: budgetUse(product.monthlyBudget, paidThisMonth.get(product.id) ?? 0),
      next: nextCharge(rows.filter((r) => r.productId === product.id)),
      dates: openDatesSummary(totals.openDates, today),
      paidWith: paidWithNames(totals.services, paymentSources),
      paidYear: paidInLastYear(payments, new Set(services.filter((s) => s.productId === product.id).map((s) => s.id)), rate, today),
    };
  });

  // The attributes, one row each (a label and a cell per app).
  const attributes: { label: string; cell: (c: Column) => React.ReactNode }[] = [
    {
      label: 'Monthly cost',
      cell: (c) => (
        <>
          <span className="block font-semibold text-slate-100 tabular-nums">{formatCurrency(c.totals.monthlyUsd, 'USD')}</span>
          <span className="block text-xs text-slate-400 tabular-nums">{formatCurrency(c.totals.monthlyEtb, 'ETB')}</span>
        </>
      ),
    },
    {
      label: 'Per year',
      cell: (c) => (
        <span className="tabular-nums">
          {usd(c.totals.monthlyUsd * 12)} <span className="text-slate-400">· {etb(c.totals.monthlyEtb * 12)}</span>
        </span>
      ),
    },
    {
      label: 'Budget this month',
      cell: (c) => {
        if (!c.budget)
          return (
            <span className="text-sm text-slate-400">
              No budget set ·{' '}
              <button type="button" onClick={() => onEditProduct(c.product)} className="font-semibold text-indigo-400 hover:text-indigo-300" aria-label={`Set a budget for ${c.product.name}`}>
                Set one
              </button>
            </span>
          );
        const line = budgetLine(c.budget);
        return <Bar pct={line.width} tone={line.tone === 'none' ? 'accent' : line.tone} caption={line.text} label={`Budget used: ${c.product.name}`} />;
      },
    },
    { label: 'Services', cell: (c) => servicesSummary(c.totals.services) },
    {
      label: 'Next charge',
      cell: (c) =>
        c.next ? (
          // A pill that may wrap: names can be long in a narrow column.
          <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-xl ${PILL[c.next.daysDiff < 0 ? 'overdue' : c.next.tone]}`}>
            {c.next.daysDiff < 0 ? `Overdue: ${chargeText(c.next)}` : chargeText(c.next)}
          </span>
        ) : (
          <span className="text-slate-400">Nothing to pay</span>
        ),
    },
    {
      label: 'Dates open',
      cell: (c) =>
        c.dates.count === 0 ? (
          <span className="text-slate-400">None</span>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span>{c.dates.count}</span>
            {c.dates.overdue > 0 && <Pill tone="overdue">{c.dates.overdue} overdue</Pill>}
            {c.dates.next && (
              <span className="text-slate-300">
                · next: {c.dates.next.title}, {shortDate(c.dates.next.date)}
              </span>
            )}
          </span>
        ),
    },
    { label: 'Paid with', cell: (c) => (c.paidWith.length ? c.paidWith.join(', ') : <span className="text-slate-400">—</span>) },
    {
      label: 'Paid in 12 months',
      cell: (c) => (
        <span className="tabular-nums">
          {usd(c.paidYear.usd)} <span className="text-slate-400">· {plural(c.paidYear.count, 'payment')}</span>
        </span>
      ),
    },
  ];

  const actions = (p: Product) => (
    <div className="flex flex-wrap gap-1">
      <button type="button" onClick={() => onSelectProduct(p.id)} className={action} aria-label={`Open ${p.name}`} title="Open its page">
        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        Open
      </button>
      <button type="button" onClick={() => onCloneProduct(p)} className={action} aria-label={`Copy ${p.name}`} title="Clone Product">
        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
        Copy
      </button>
      <button type="button" onClick={() => onEditProduct(p)} className={action} aria-label={`Edit ${p.name}`} title="Edit Product">
        <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
        Edit
      </button>
      <button
        type="button"
        onClick={() => setProductToDelete(p)}
        className={`${action} hover:text-rose-600 dark:hover:text-rose-400`}
        aria-label={`Delete ${p.name}`}
        title="Delete Product"
      >
        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
        Delete
      </button>
    </div>
  );

  const nameButton = (p: Product) => (
    <button type="button" onClick={() => onSelectProduct(p.id)} className="text-left hover:underline break-words">
      {p.name}
    </button>
  );

  const statusLine = (c: Column) => (
    <span className="flex flex-wrap items-center gap-2 min-w-0">
      <Pill tone={statusTone(c.product.status)}>{statusLabel(c.product.status)}</Pill>
      {c.site && <span className="text-xs text-slate-400 truncate">{c.site}</span>}
    </span>
  );

  // Description and tags, as on the Classic cards.
  const about = (p: Product) => (
    <>
      <span className="block text-xs text-slate-300 line-clamp-2">{p.description || 'No description provided.'}</span>
      {p.tags?.length > 0 && <span className="block text-xs text-slate-400 break-words">{p.tags.map((t) => `#${t}`).join(' ')}</span>}
    </>
  );

  return (
    <Page>
      <PageHead
        eyebrow="Apps"
        title={`${products.length} app${products.length === 1 ? '' : 's'}, side by side`}
        sub="Compare what each app costs, how close it is to its budget, and what it runs on."
        stats={
          <>
            <Stat label="This month" value={usd(totalCosts.totalUsd)} sub={etb(totalCosts.totalEtb)} />
            <Stat label="Budgets set" value={`${budgetsSet} of ${products.length}`} />
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

      {!columns.length ? (
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
        <div className="flex flex-wrap gap-5 items-stretch">
          {/* Wide screens: one column per app (scrolls inside its box when there are many) */}
          <div className="hidden md:block flex-[999_1_640px] min-w-0 rounded-2xl bg-slate-900 border border-slate-800 overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <caption className="sr-only">Your apps side by side</caption>
              <thead>
                <tr className="bg-slate-800/40">
                  <td className="w-40 px-5 py-4" />
                  {columns.map((c) => (
                    <th key={c.product.id} scope="col" className="px-5 py-4 align-top min-w-[210px] font-normal">
                      <span className="block text-2xl font-bold text-slate-100">{nameButton(c.product)}</span>
                      <span className="block mt-1.5">{statusLine(c)}</span>
                      <span className="block mt-2 space-y-1">{about(c.product)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attributes.map((a) => (
                  <tr key={a.label} className="border-t border-slate-800">
                    <th scope="row" className="px-5 py-3.5 align-top text-sm font-normal text-slate-400 whitespace-nowrap">
                      {a.label}
                    </th>
                    {columns.map((c) => (
                      <td key={c.product.id} className="px-5 py-3.5 align-top text-slate-200 min-w-[210px] break-words">
                        {a.cell(c)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-slate-800">
                  <th scope="row" className="px-5 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                  {columns.map((c) => (
                    <td key={c.product.id} className="px-4 py-3 align-top">
                      {actions(c.product)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Phones: a card per app */}
          <ul className="md:hidden w-full space-y-4">
            {columns.map((c) => {
              const headingId = `app-card-${c.product.id}`;
              return (
                <li key={c.product.id}>
                  <section aria-labelledby={headingId} className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
                    <div className="px-5 pt-5 pb-4 space-y-2 border-b border-slate-800 bg-slate-800/40">
                      <h2 id={headingId} className="text-2xl font-bold text-slate-100">
                        {nameButton(c.product)}
                      </h2>
                      {statusLine(c)}
                      <span className="block space-y-1">{about(c.product)}</span>
                    </div>
                    <dl>
                      {attributes.map((a) => (
                        <div key={a.label} className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 px-5 py-3 border-b border-slate-800">
                          <dt className="text-xs text-slate-400 pt-0.5">{a.label}</dt>
                          <dd className="text-sm text-slate-200 min-w-0 break-words">{a.cell(c)}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="px-4 py-3">{actions(c.product)}</div>
                  </section>
                </li>
              );
            })}
          </ul>

          <div className="flex-[1_1_220px] md:flex-[0_1_220px] min-h-[220px] rounded-2xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center gap-2 p-5 text-center">
            <button type="button" onClick={onOpenCreateModal} className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 hover:bg-slate-800/50">
              <Plus className="w-7 h-7 text-indigo-400" aria-hidden="true" />
              <span className="text-[15px] font-semibold text-slate-100">Add an app</span>
            </button>
            <button type="button" onClick={onOpenTemplatePicker} className="text-sm text-slate-300 hover:text-slate-100 underline underline-offset-2">
              or start from a template
            </button>
          </div>
        </div>
      )}

      <DeleteAppDialog product={productToDelete} message={DELETE_APP_MESSAGE.list} onClose={() => setProductToDelete(null)} />
    </Page>
  );
};
