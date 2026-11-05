import React, { useState, useEffect } from 'react';
import { X, Calendar, Plus, Trash2, KeyRound } from 'lucide-react';
import { ImportantDate, ImportantDateType, RecurrenceType, ImportantDateStatus, ImportantDateSource } from '../../types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { SecretGuardNotice } from '../vault/SecretGuardNotice';
import { NumberField } from '../common/NumberField';

interface DateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<ImportantDate, 'id' | 'workspaceId' | 'createdAt'>) => void;
  initialDate?: ImportantDate | null;
  defaultProductId?: string;
  onOpenVaultModal?: () => void;
}

const DATE_TYPES: ImportantDateType[] = [
  'domain expiry',
  'SSL expiry',
  'invoice due',
  'key rotation',
  'free trial end',
  'contract renewal',
  'custom',
];

export const DateModal: React.FC<DateModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialDate,
  defaultProductId,
  onOpenVaultModal,
}) => {
  const { products, currentWorkspace } = useWorkspace();

  const [productId, setProductId] = useState('');
  const [type, setType] = useState<ImportantDateType>('key rotation');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrenceType>('none');
  const [customRecurrenceDays, setCustomRecurrenceDays] = useState<number>(90);
  const [leadDays, setLeadDays] = useState<number[]>(currentWorkspace.defaultLeadDays || [30, 14, 7, 1]);
  const [customLeadInput, setCustomLeadInput] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<ImportantDateStatus>('open');
  const [source, setSource] = useState<ImportantDateSource>('manual');

  useEffect(() => {
    if (initialDate) {
      setProductId(initialDate.productId || '');
      setType(initialDate.type);
      setTitle(initialDate.title);
      setDueDate(initialDate.dueDate);
      setRecurrence(initialDate.recurrence);
      setCustomRecurrenceDays(initialDate.customRecurrenceDays || 90);
      setLeadDays(initialDate.leadDays || currentWorkspace.defaultLeadDays);
      setNotes(initialDate.notes || '');
      setStatus(initialDate.status);
      setSource(initialDate.source);
    } else {
      setProductId(defaultProductId || '');
      setType('key rotation');
      setTitle('');
      setDueDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
      setRecurrence('none');
      setCustomRecurrenceDays(90);
      setLeadDays(currentWorkspace.defaultLeadDays || [30, 14, 7, 1]);
      setNotes('');
      setStatus('open');
      setSource('manual');
    }
  }, [initialDate, defaultProductId, currentWorkspace, isOpen]);

  if (!isOpen) return null;

  const toggleLeadDay = (day: number) => {
    if (leadDays.includes(day)) {
      setLeadDays(leadDays.filter((d) => d !== day));
    } else {
      setLeadDays([...leadDays, day].sort((a, b) => b - a));
    }
  };

  const addCustomLead = () => {
    const val = parseInt(customLeadInput, 10);
    if (!isNaN(val) && val > 0 && !leadDays.includes(val)) {
      setLeadDays([...leadDays, val].sort((a, b) => b - a));
      setCustomLeadInput('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;

    onSubmit({
      productId: productId || undefined,
      type,
      title: title.trim(),
      dueDate,
      recurrence,
      customRecurrenceDays: recurrence === 'custom days' ? customRecurrenceDays : undefined,
      leadDays,
      notes: notes.trim(),
      status,
      source,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl relative text-slate-100 my-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">
              {initialDate ? 'Edit Milestone / Date' : 'Add Important Due Date'}
            </h3>
            <p className="text-xs text-slate-400">
              Domain renewals, SSL expiries, key rotations, or invoice deadlines
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Rotate Supabase Master Password"
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Milestone Type *
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ImportantDateType)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500 capitalize"
              >
                {DATE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Associated Product (Optional)
              </label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500"
              >
                <option value="">Global / Workspace-wide</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Due Date *
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Recurrence
              </label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as RecurrenceType)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500 capitalize"
              >
                <option value="none">None (One-time)</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly (3 months)</option>
                <option value="yearly">Yearly</option>
                <option value="custom days">Custom Interval (Days)</option>
              </select>
            </div>
          </div>

          {recurrence === 'custom days' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Every N Days
              </label>
              <NumberField
                min="1"
                value={customRecurrenceDays}
                onValueChange={setCustomRecurrenceDays}
                fallback={30}
                integer
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100"
              />
            </div>
          )}

          {/* Lead Days Selector with Quick Chips */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-750 space-y-2">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
              Reminder Lead Days (Alert triggers N days prior)
            </span>
            <div className="flex flex-wrap gap-1.5 items-center">
              {[30, 14, 7, 3, 1].map((day) => {
                const isSelected = leadDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleLeadDay(day)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-750 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {day} days before
                  </button>
                );
              })}
            </div>

            {/* Custom Lead Input */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="number"
                min="1"
                placeholder="Custom days..."
                value={customLeadInput}
                onChange={(e) => setCustomLeadInput(e.target.value)}
                className="w-32 px-2.5 py-1 rounded-lg bg-slate-850 border border-slate-700 text-xs text-slate-200"
              />
              <button
                type="button"
                onClick={addCustomLead}
                className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-650 text-xs font-medium text-slate-200"
              >
                + Add Custom
              </button>
            </div>
          </div>

          {/* Notes with Secret Guardrail */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Notes & Instructions
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Important rotation steps, registrar contact, renewal ticket number..."
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
            />
            <SecretGuardNotice text={notes} onOpenVaultModal={onOpenVaultModal} />
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
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/30 transition-colors"
            >
              {initialDate ? 'Save Milestone' : 'Add Due Date'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
