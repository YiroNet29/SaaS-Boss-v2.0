/**
 * Pieces both one-app pages (Timeline and Portfolio) share: the head with the app's facts and money,
 * the budget bar with the app's actions, the environments card, Mark paid, and the date buttons.
 */
import React, { useState } from 'react';
import { CheckCircle2, Copy, Edit2, ExternalLink, GitFork, Globe, Plus, Trash2 } from 'lucide-react';
import type { Environment, ImportantDate, Product, ServiceLink } from '../../types';
import type { BudgetUse } from '../../utils/budgets';
import { useWorkspace } from '../../context/WorkspaceContext';
import { VaultRefChip } from '../vault/VaultRefChip';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { budgetLine, siteName } from '../../utils/portfolio';
import { canMarkPaid, serviceStatusTone, statusLabel } from '../../utils/appPages';
import { Bar, Page, PageHead, Pill, Section, Stat, Toolbar, btnPrimary, btnSecondary, btnSmall } from './kit';

export const usd = (n: number) => formatCurrency(Math.round(n * 100) / 100, 'USD');
export const etb = (n: number) => formatCurrency(Math.round(n), 'ETB');
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Description, live site, repository, created date and tags, in one line that wraps. */
const AppFacts: React.FC<{ product: Product }> = ({ product }) => {
  const site = siteName(product.liveUrl) || product.liveUrl?.replace(/^https?:\/\//, '');
  const facts: React.ReactNode[] = [<span key="d">{product.description || 'No description provided.'}</span>];
  if (product.liveUrl)
    facts.push(
      <a key="live" href={product.liveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-indigo-400 hover:text-indigo-300">
        <Globe className="w-3.5 h-3.5" aria-hidden="true" />
        {site}
        <ExternalLink className="w-3 h-3" aria-hidden="true" />
      </a>
    );
  if (product.repoUrl)
    facts.push(
      <a key="repo" href={product.repoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-indigo-400 hover:text-indigo-300">
        <GitFork className="w-3.5 h-3.5" aria-hidden="true" />
        Repository
        <ExternalLink className="w-3 h-3" aria-hidden="true" />
      </a>
    );
  facts.push(<span key="c">Created {formatDate(product.createdAt)}</span>);
  if (product.tags?.length) facts.push(<span key="t">{product.tags.map((t) => `#${t}`).join(' ')}</span>);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 break-words">
      {facts.map((f, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <span className="text-slate-400" aria-hidden="true">
              ·
            </span>
          )}
          {f}
        </React.Fragment>
      ))}
    </div>
  );
};

/** "App · Live", the name, its facts, and Monthly / Per year / Paid in 12 months. */
export const AppHead: React.FC<{
  product: Product;
  costSummary: { totalUsd: number; totalEtb: number };
  paidYear: { usd: number; count: number };
  onBack: () => void;
}> = ({ product, costSummary, paidYear, onBack }) => (
  <PageHead
    back={{ label: 'All apps', onClick: onBack }}
    eyebrow={`App · ${statusLabel(product.status)}`}
    title={product.name}
    sub={<AppFacts product={product} />}
    stats={
      <>
        <Stat label="Monthly" value={usd(costSummary.totalUsd)} sub={etb(costSummary.totalEtb)} className="col-span-2 sm:col-span-1" />
        <Stat label="Per year" value={usd(costSummary.totalUsd * 12)} sub={etb(costSummary.totalEtb * 12)} />
        <Stat label="Paid in 12 months" value={usd(paidYear.usd)} sub={paidYear.count > 0 ? plural(paidYear.count, 'payment') : undefined} />
      </>
    }
  />
);

/** The budget bar (only when the app has a budget) and the app's buttons. */
export const AppToolbar: React.FC<{
  budget: BudgetUse | null;
  onClone: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddDate: () => void;
  onAddService: () => void;
}> = ({ budget, onClone, onEdit, onDelete, onAddDate, onAddService }) => {
  const line = budgetLine(budget);
  return (
    <Toolbar
      left={
        budget && (
          <div className="w-full sm:w-[360px]">
            <Bar pct={line.width} tone={line.tone === 'none' ? 'accent' : line.tone} caption={line.text} label="Budget used" />
          </div>
        )
      }
      right={
        <>
          <button type="button" onClick={onClone} className={btnSecondary} title="Make a copy of this app with the same services">
            <Copy className="w-4 h-4" aria-hidden="true" />
            Copy app
          </button>
          <button type="button" onClick={onEdit} className={btnSecondary} title="Edit app info">
            <Edit2 className="w-4 h-4" aria-hidden="true" />
            Edit
          </button>
          <button type="button" onClick={onDelete} className={btnSecondary} title="Delete app">
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            Delete
          </button>
          <button type="button" onClick={onAddDate} className={btnSecondary}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add date
          </button>
          <button type="button" onClick={onAddService} className={btnPrimary}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add service
          </button>
        </>
      }
    />
  );
};

/** Shown when the app is gone (deleted elsewhere, or a stale link). */
export const AppNotFound: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <Page>
    <PageHead back={{ label: 'All apps', onClick: onBack }} eyebrow="App" title="App not found" sub="It may have been deleted." />
  </Page>
);

const ENV_NAME: Record<Environment['type'], string> = { production: 'Production', staging: 'Staging', dev: 'Dev' };

/** Each environment with its address and how many of the app's services run there. */
export const EnvironmentsCard: React.FC<{ environments: Environment[]; services: ServiceLink[] }> = ({ environments, services }) => (
  <Section id="app-environments" title={`Environments (${environments.length})`}>
    {environments.length === 0 ? (
      <p className="px-5 py-4 text-sm text-slate-400">No environments.</p>
    ) : (
      <ul>
        {environments.map((env) => (
          <li key={env.id} className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-800 last:border-b-0">
            <span className="min-w-0 flex flex-col">
              <span className="text-sm font-semibold text-slate-100">{ENV_NAME[env.type] ?? env.type}</span>
              {env.baseUrl ? (
                <a
                  href={env.baseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-slate-300 hover:text-indigo-300 break-all inline-flex items-center gap-1"
                >
                  <span>{env.baseUrl}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                </a>
              ) : (
                <span className="text-xs text-slate-400">Not set</span>
              )}
            </span>
            <span className="text-xs text-slate-400 whitespace-nowrap">{plural(services.filter((s) => s.environmentType === env.type).length, 'service')}</span>
          </li>
        ))}
      </ul>
    )}
  </Section>
);

/** The service's vault keys, when it has any. */
export const VaultChips: React.FC<{ service: ServiceLink }> = ({ service }) =>
  service.vaultRefs?.length > 0 ? (
    <div className="flex flex-wrap gap-1.5">
      {service.vaultRefs.map((v) => (
        <VaultRefChip key={v.vaultItemId} label={v.label} itemId={v.vaultItemId} prefix="Vault: " />
      ))}
    </div>
  ) : null;

/** Trial / Paused / Cancelled (nothing for an active service). */
export const ServiceStatusPill: React.FC<{ service: ServiceLink }> = ({ service }) =>
  service.status === 'active' ? null : <Pill tone={serviceStatusTone(service.status)}>{statusLabel(service.status)}</Pill>;

/** What Mark paid said, for the service it was pressed on. */
export interface PaidNote {
  id: string;
  text: string;
  ok: boolean;
}

/** Mark paid with the same messages as the Services page; the page shows the note next to the service. */
export function useMarkPaid() {
  const { markServicePaid } = useWorkspace();
  const [note, setNote] = useState<PaidNote | null>(null);
  const markPaid = (service: ServiceLink) => {
    const r = markServicePaid(service.id);
    setNote({ id: service.id, ok: r.ok, text: r.ok ? `Paid ✓ next ${r.next}` : r.error ?? 'Could not mark paid' });
  };
  return { note, markPaid };
}

/** The Mark paid button, offered by the same rule as the Services page, and its note. */
export const MarkPaid: React.FC<{ service: ServiceLink; note: PaidNote | null; onMark: (s: ServiceLink) => void }> = ({ service, note, onMark }) => (
  <>
    {canMarkPaid(service) && (
      <button
        type="button"
        onClick={() => onMark(service)}
        className={btnSmall}
        aria-label={`Mark paid: ${service.providerName}`}
        title="Record this renewal as paid and move to the next date"
      >
        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
        Mark paid
      </button>
    )}
    {note?.id === service.id && (
      <span role="status">
        <Pill tone={note.ok ? 'ok' : 'bad'}>{note.text}</Pill>
      </span>
    )}
  </>
);

/** Done and Snooze for a date that is not done (same actions as the Classic page). */
export const DateButtons: React.FC<{ item: ImportantDate; snoozeText: string }> = ({ item, snoozeText }) => {
  const { markDateDone, snoozeImportantDate } = useWorkspace();
  if (item.status === 'done') return null;
  return (
    <>
      <button
        type="button"
        onClick={() => markDateDone(item.id)}
        className={btnSmall}
        aria-label={`Done: ${item.title}`}
        title="Mark Done (will auto-schedule next date if recurring)"
      >
        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
        Done
      </button>
      <button
        type="button"
        onClick={() => snoozeImportantDate(item.id, 7)}
        className={btnSmall}
        aria-label={`${snoozeText}: ${item.title}`}
        title="Snooze 7 days"
      >
        {snoozeText}
      </button>
    </>
  );
};

/** A quiet line with a button, for "No dates for this app yet" inside a card. */
export const Hint: React.FC<{ text: string; action: string; onClick: () => void }> = ({ text, action, onClick }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-slate-800">
    <p className="text-sm text-slate-400 min-w-0">{text}</p>
    <button type="button" onClick={onClick} className={btnSmall}>
      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
      {action}
    </button>
  </div>
);
