import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  List,
  Grid3X3,
  ExternalLink,
} from 'lucide-react';
import { ImportantDate, ServiceLink, Product } from '../../types';
import { formatDate, formatCurrency } from '../../utils/formatters';
import { generateICS, downloadICS } from '../../utils/ics';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useSensitiveAction } from '../../context/LockContext';

interface CalendarViewProps {
  dates: ImportantDate[];
  services: ServiceLink[];
  products: Product[];
  onSelectDateItem: (d: ImportantDate) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  dates,
  services,
  products,
  onSelectDateItem,
}) => {
  const { currentWorkspace } = useWorkspace();
  const sensitive = useSensitiveAction();
  const [viewMode, setViewMode] = useState<'month' | 'agenda'>('month');

  // Month navigation: default to current month October 2026
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date('2026-10-01T00:00:00Z'));
  const [selectedDayEvents, setSelectedDayEvents] = useState<{ dateStr: string; items: any[] } | null>(null);

  const prodMap = new Map<string, string>();
  for (const p of products) {
    prodMap.set(p.id, p.name);
  }

  // Combine dates and active service renewals
  const allEvents: {
    id: string;
    type: 'date' | 'renewal';
    title: string;
    dateStr: string;
    productName: string;
    cost?: number;
    currency?: string;
    rawDate?: ImportantDate;
    rawService?: ServiceLink;
  }[] = [];

  for (const d of dates) {
    if (d.status === 'done') continue;
    const target = d.snoozedUntil || d.dueDate;
    if (!target) continue;
    allEvents.push({
      id: d.id,
      type: 'date',
      title: d.title,
      dateStr: target.slice(0, 10),
      productName: d.productId ? prodMap.get(d.productId) || 'Global' : 'Global',
      rawDate: d,
    });
  }

  for (const s of services) {
    if (s.status === 'cancelled' || !s.renewalDate) continue;
    allEvents.push({
      id: s.id,
      type: 'renewal',
      title: `${s.providerName} Renewal`,
      dateStr: s.renewalDate.slice(0, 10),
      productName: prodMap.get(s.productId) || 'Product',
      cost: s.cost,
      currency: s.currency,
      rawService: s,
    });
  }

  // Sort events chronologically
  allEvents.sort((a, b) => a.dateStr.localeCompare(b.dateStr));

  // Calendar matrix calculation
  const year = currentMonth.getUTCFullYear();
  const month = currentMonth.getUTCMonth();

  const firstDayOfMonth = new Date(Date.UTC(year, month, 1));
  const startingDayIndex = firstDayOfMonth.getUTCDay(); // 0 is Sunday
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const prevMonth = () => {
    setCurrentMonth(new Date(Date.UTC(year, month - 1, 1)));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(Date.UTC(year, month + 1, 1)));
  };

  const monthName = currentMonth.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const handleExportICS = async () => {
    if (!(await sensitive('export your calendar', { exportOf: 'Calendar (.ics)' }))) return;
    const ics = generateICS(dates, services, products, currentWorkspace.name);
    downloadICS(ics, `stacktrack-${currentWorkspace.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.ics`);
  };

  return (
    <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
      {/* Top Header & Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span>{monthName}</span>
            </h3>
            <p className="text-xs text-slate-400">
              {allEvents.length} upcoming renewals and milestones
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Month / Agenda toggle */}
          <div className="flex items-center rounded-xl bg-slate-800 p-1 border border-slate-700">
            <button
              onClick={() => setViewMode('month')}
              className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                viewMode === 'month' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Month</span>
            </button>
            <button
              onClick={() => setViewMode('agenda')}
              className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                viewMode === 'agenda' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Agenda</span>
            </button>
          </div>

          {/* Month Nav Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700"
              aria-label="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700"
              aria-label="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Export to .ICS */}
          <button
            onClick={handleExportICS}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export .ics</span>
          </button>
        </div>
      </div>

      {/* Month View Grid */}
      {viewMode === 'month' && (
        <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-850">
          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 border-b border-slate-800 text-center text-[11px] font-semibold text-slate-400 py-2 bg-slate-900/60">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {/* Calendar Day Cells */}
          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-800/60">
            {/* Blank offset cells */}
            {Array.from({ length: startingDayIndex }).map((_, i) => (
              <div key={`offset-${i}`} className="min-h-20 sm:min-h-24 p-1.5 bg-slate-900/30 opacity-40" />
            ))}

            {/* Days in Month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const dayEvents = allEvents.filter((e) => e.dateStr === dateStr);
              const isToday = dateStr === new Date().toISOString().slice(0, 10);

              return (
                <div
                  key={dateStr}
                  onClick={() => dayEvents.length > 0 && setSelectedDayEvents({ dateStr, items: dayEvents })}
                  className={`min-h-20 sm:min-h-24 p-1.5 transition-colors relative flex flex-col justify-between ${
                    dayEvents.length > 0 ? 'cursor-pointer hover:bg-slate-800/60' : ''
                  } ${isToday ? 'bg-indigo-950/30' : 'bg-slate-900/50'}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold font-mono ${
                        isToday
                          ? 'w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center'
                          : 'text-slate-300'
                      }`}
                    >
                      {dayNum}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-semibold px-1 rounded bg-indigo-500/20 text-indigo-300">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 mt-1 overflow-hidden">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className={`text-[10px] px-1.5 py-0.5 rounded truncate font-medium ${
                          ev.type === 'renewal'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'
                            : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20'
                        }`}
                        title={ev.title}
                      >
                        {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[9px] text-slate-400 pl-1">
                        +{dayEvents.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agenda / Timeline View */}
      {viewMode === 'agenda' && (
        <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-850 overflow-hidden">
          {!allEvents.length ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No upcoming dates or renewals found.
            </div>
          ) : (
            allEvents.map((ev) => (
              <div
                key={ev.id}
                onClick={() => ev.rawDate && onSelectDateItem(ev.rawDate)}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-bold text-slate-400 w-24 shrink-0">
                    {formatDate(ev.dateStr)}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-200">{ev.title}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-800 text-slate-400">
                        {ev.productName}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                          ev.type === 'renewal'
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : 'bg-indigo-500/10 text-indigo-300'
                        }`}
                      >
                        {ev.type}
                      </span>
                    </div>
                  </div>
                </div>

                {ev.cost !== undefined && ev.currency && (
                  <div className="font-mono text-xs font-bold text-emerald-400 self-end sm:self-auto">
                    {formatCurrency(ev.cost, ev.currency as any)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Day Events Click Details Modal */}
      {selectedDayEvents && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl relative text-slate-100">
            <button
              onClick={() => setSelectedDayEvents(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1"
            >
              ×
            </button>
            <h4 className="text-base font-bold text-slate-100 mb-1 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-indigo-400" />
              <span>Events on {formatDate(selectedDayEvents.dateStr)}</span>
            </h4>
            <div className="mt-4 space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {selectedDayEvents.items.map((it) => (
                <div
                  key={it.id}
                  onClick={() => {
                    if (it.rawDate) {
                      onSelectDateItem(it.rawDate);
                      setSelectedDayEvents(null);
                    }
                  }}
                  className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-between cursor-pointer hover:bg-slate-750"
                >
                  <div>
                    <div className="font-semibold text-xs text-slate-100">{it.title}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {it.productName} • {it.type}
                    </div>
                  </div>
                  {it.cost !== undefined && it.currency && (
                    <div className="font-mono text-xs font-bold text-emerald-400">
                      {formatCurrency(it.cost, it.currency)}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setSelectedDayEvents(null)}
              className="mt-4 w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-slate-200"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
