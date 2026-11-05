import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Edit2,
  Trash2,
  List,
  Grid3X3,
  CalendarCheck,
  RotateCw,
} from 'lucide-react';
import { ImportantDate, ImportantDateType } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { StatusBadge } from '../common/StatusBadge';
import { formatDate, formatDaysDiff } from '../../utils/formatters';
import { getDaysDiff } from '../../utils/reminders';
import { EmptyState } from '../common/EmptyState';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { CalendarView } from './CalendarView';
import { useSensitiveAction } from '../../context/LockContext';

interface DatesListViewProps {
  onAddDate: () => void;
  onEditDate: (d: ImportantDate) => void;
  onOpenSnooze: (d: ImportantDate) => void;
}

export const DatesListView: React.FC<DatesListViewProps> = ({
  onAddDate,
  onEditDate,
  onOpenSnooze,
}) => {
  const {
    dates,
    products,
    services,
    deleteImportantDate,
    markDateDone,
  } = useWorkspace();
  const sensitive = useSensitiveAction();

  const [activeView, setActiveView] = useState<'list' | 'calendar'>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [dateToDelete, setDateToDelete] = useState<ImportantDate | null>(null);

  const prodMap = new Map<string, string>();
  for (const p of products) {
    prodMap.set(p.id, p.name);
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // Filter dates
  const filteredDates = dates.filter((d) => {
    const pName = d.productId ? prodMap.get(d.productId) || '' : 'Global';
    const matchesSearch =
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      pName.toLowerCase().includes(search.toLowerCase()) ||
      d.notes?.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'open'
        ? d.status === 'open' || d.status === 'snoozed'
        : d.status === statusFilter;

    const matchesType = typeFilter === 'all' || d.type === typeFilter;
    const matchesProduct = productFilter === 'all' || d.productId === productFilter;

    return matchesSearch && matchesStatus && matchesType && matchesProduct;
  });

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
            <span>Important Dates & Renewals</span>
            <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
              {dates.length}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Key rotation cycles, domain renewals, SSL expiries, and trial cutoffs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle View mode */}
          <div className="flex items-center rounded-xl bg-slate-800 p-1 border border-slate-700">
            <button
              onClick={() => setActiveView('list')}
              className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                activeView === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              onClick={() => setActiveView('calendar')}
              className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                activeView === 'calendar' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
          </div>

          <button
            onClick={onAddDate}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Date</span>
          </button>
        </div>
      </div>

      {activeView === 'calendar' ? (
        <CalendarView
          dates={dates}
          services={services}
          products={products}
          onSelectDateItem={(d) => onEditDate(d)}
        />
      ) : (
        <>
          {/* Filter Toolbar */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search title, product, notes..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 capitalize"
                >
                  <option value="open">Active & Snoozed</option>
                  <option value="all">All Dates</option>
                  <option value="done">Completed</option>
                </select>

                {/* Type Filter */}
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 capitalize"
                >
                  <option value="all">All Types</option>
                  {[
                    'domain expiry',
                    'SSL expiry',
                    'invoice due',
                    'key rotation',
                    'free trial end',
                    'contract renewal',
                    'custom',
                  ].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                {/* Product Filter */}
                <select
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200"
                >
                  <option value="all">All Products</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Dates List */}
          {!filteredDates.length ? (
            <EmptyState
              icon={CalendarIcon}
              title="No milestones match filter"
              description="Keep track of key rotation deadlines and SSL renewal certificates."
              actionLabel="Add Date Milestone"
              onAction={onAddDate}
            />
          ) : (
            <div className="space-y-3">
              {filteredDates.map((item) => {
                const effectiveDate = item.snoozedUntil || item.dueDate;
                const daysDiff = getDaysDiff(todayStr, effectiveDate);
                const diffMeta = formatDaysDiff(daysDiff);
                const productName = item.productId ? prodMap.get(item.productId) || 'Global' : 'Global';

                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-750 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                          diffMeta.urgency === 'overdue'
                            ? 'bg-rose-500 animate-pulse'
                            : diffMeta.urgency === 'urgent'
                            ? 'bg-amber-400'
                            : 'bg-indigo-400'
                        }`}
                      />

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-slate-100">
                            {item.title}
                          </span>
                          <span className="text-[10px] font-semibold text-indigo-300 px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20">
                            {productName}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-800 text-slate-300 capitalize">
                            {item.type}
                          </span>
                          <StatusBadge status={item.status} size="sm" />
                          {item.source === 'vault' && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                              Vault Sync
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                          <span>
                            Due: {formatDate(item.dueDate)}
                            {item.snoozedUntil && ` (Snoozed to ${formatDate(item.snoozedUntil)})`}
                          </span>
                          <span
                            className={`font-semibold ${
                              diffMeta.urgency === 'overdue'
                                ? 'text-rose-400'
                                : diffMeta.urgency === 'urgent'
                                ? 'text-amber-300'
                                : 'text-slate-300'
                            }`}
                          >
                            ({diffMeta.label})
                          </span>
                          {item.recurrence !== 'none' && (
                            <span className="flex items-center gap-1 text-indigo-300">
                              <RotateCw className="w-3 h-3" />
                              <span>Recurs {item.recurrence}</span>
                            </span>
                          )}
                        </div>

                        {item.notes && (
                          <p className="text-xs text-slate-400 italic pt-0.5">
                            "{item.notes}"
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                      {item.status !== 'done' && (
                        <>
                          <button
                            onClick={() => markDateDone(item.id)}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1 transition-colors"
                            title="Mark Done (Auto-generates next date if recurring)"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Done</span>
                          </button>
                          <button
                            onClick={() => onOpenSnooze(item)}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                            title="Snooze"
                          >
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            <span>Snooze</span>
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => onEditDate(item)}
                        className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300"
                        title="Edit milestone"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDateToDelete(item)}
                        className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                        title="Delete milestone"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation */}
      {dateToDelete && (
        <ConfirmDialog
          isOpen={!!dateToDelete}
          title={`Delete "${dateToDelete.title}"?`}
          message="This will delete this tracked milestone."
          isDestructive
          confirmLabel="Delete Date"
          onConfirm={async () => {
            if (!(await sensitive(`delete "${dateToDelete.title}"`))) return setDateToDelete(null);
            deleteImportantDate(dateToDelete.id);
            setDateToDelete(null);
          }}
          onCancel={() => setDateToDelete(null)}
        />
      )}
    </div>
  );
};
