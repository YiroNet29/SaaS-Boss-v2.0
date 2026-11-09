import React, { useState } from 'react';
import { X, Edit3 } from 'lucide-react';
import { ServiceLink, Currency } from '../../types';
import { NumberField } from '../common/NumberField';

interface BulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedServiceIds: string[];
  onApplyBulkEdit: (serviceIds: string[], updates: Partial<ServiceLink>) => void;
}

export const BulkEditModal: React.FC<BulkEditModalProps> = ({
  isOpen,
  onClose,
  selectedServiceIds,
  onApplyBulkEdit,
}) => {
  const [updateRenewalDate, setUpdateRenewalDate] = useState(false);
  const [renewalDate, setRenewalDate] = useState('');

  const [updateCost, setUpdateCost] = useState(false);
  const [cost, setCost] = useState<number>(0);
  const [currency, setCurrency] = useState<Currency>('USD');

  const [updateStatus, setUpdateStatus] = useState(false);
  const [status, setStatus] = useState<'active' | 'trial' | 'paused' | 'cancelled'>('active');

  if (!isOpen || !selectedServiceIds.length) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updates: Partial<ServiceLink> = {};

    if (updateRenewalDate && renewalDate) {
      updates.renewalDate = renewalDate;
    }
    if (updateCost) {
      updates.cost = cost;
      updates.currency = currency;
    }
    if (updateStatus) {
      updates.status = status;
    }

    if (Object.keys(updates).length > 0) {
      onApplyBulkEdit(selectedServiceIds, updates);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl relative text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <Edit3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">
              Bulk Edit Services
            </h3>
            <p className="text-xs text-slate-400">
              Modifying {selectedServiceIds.length} selected service{selectedServiceIds.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Option 1: Renewal Date */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-750 space-y-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={updateRenewalDate}
                onChange={(e) => setUpdateRenewalDate(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 bg-slate-800 border-slate-700"
              />
              <span>Update Renewal Date</span>
            </label>
            {updateRenewalDate && (
              <input
                type="date"
                required={updateRenewalDate}
                value={renewalDate}
                onChange={(e) => setRenewalDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-850 border border-slate-700 text-xs text-slate-100 focus:outline-hidden"
              />
            )}
          </div>

          {/* Option 2: Cost & Currency */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-750 space-y-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={updateCost}
                onChange={(e) => setUpdateCost(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 bg-slate-800 border-slate-700"
              />
              <span>Update Subscription Cost</span>
            </label>
            {updateCost && (
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  step="0.01"
                  min="0"
                  value={cost}
                  onValueChange={setCost}
                  placeholder="Cost"
                  className="px-3 py-1.5 rounded-lg bg-slate-850 border border-slate-700 text-xs text-slate-100 font-mono"
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as Currency)}
                  className="px-3 py-1.5 rounded-lg bg-slate-850 border border-slate-700 text-xs text-slate-100"
                >
                  <option value="USD">USD ($)</option>
                  <option value="ETB">ETB (Birr)</option>
                </select>
              </div>
            )}
          </div>

          {/* Option 3: Status */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-750 space-y-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={updateStatus}
                onChange={(e) => setUpdateStatus(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 bg-slate-800 border-slate-700"
              />
              <span>Update Status</span>
            </label>
            {updateStatus && (
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-850 border border-slate-700 text-xs text-slate-100 capitalize"
              >
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="paused">Paused</option>
                <option value="cancelled">Cancelled</option>
              </select>
            )}
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-750 border border-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!updateRenewalDate && !updateCost && !updateStatus}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-600/30 transition-colors"
            >
              Apply Bulk Edit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
