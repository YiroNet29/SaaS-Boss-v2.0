import React, { useState } from 'react';
import { Clock, X, Calendar } from 'lucide-react';
import { ImportantDate } from '../../types';
import { snoozeUntil } from '../../utils/reminders';
import { formatDate } from '../../utils/formatters';

interface SnoozeModalProps {
  isOpen: boolean;
  onClose: () => void;
  dateItem: ImportantDate | null;
  onSnooze: (dateId: string, days: number) => void;
}

export const SnoozeModal: React.FC<SnoozeModalProps> = ({
  isOpen,
  onClose,
  dateItem,
  onSnooze,
}) => {
  const [selectedDays, setSelectedDays] = useState<number>(7);

  if (!isOpen || !dateItem) return null;

  const baseDate = dateItem.snoozedUntil || dateItem.dueDate;
  const newDate = snoozeUntil(baseDate, new Date().toLocaleDateString('en-CA'), selectedDays);

  const handleApply = () => {
    onSnooze(dateItem.id, selectedDays);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl relative text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">
              Snooze Reminder
            </h3>
            <p className="text-xs text-slate-400 truncate max-w-[220px]">
              {dateItem.title}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Select Snooze Duration
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[1, 3, 7, 14, 30].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setSelectedDays(days)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                    selectedDays === days
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700'
                  }`}
                >
                  +{days} Day{days !== 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-750 text-xs space-y-1">
            <div className="text-slate-400">Current Due Date: {formatDate(baseDate)}</div>
            <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>New Alert Date: {formatDate(newDate)}</span>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2.5 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-750 border border-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/30 transition-colors"
            >
              Snooze for {selectedDays} Days
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
