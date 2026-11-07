import React, { useState } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { Modal, inputCls, labelCls } from '../money/MoneyForms';

/** Names and creates a new workspace, switches to it, then hands over to the setup wizard. */
export const NewWorkspaceModal: React.FC<{ onClose: () => void; onCreated: () => void }> = ({ onClose, onCreated }) => {
  const { createWorkspace, currentWorkspace } = useWorkspace();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createWorkspace(
        name.trim(),
        currentWorkspace.baseCurrency,
        currentWorkspace.exchangeRates?.ETB_per_USD || 155,
        currentWorkspace.defaultLeadDays ?? [30, 14, 7, 1]
      );
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="New workspace" subtitle="A separate set of products, services, cards and reminders." onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="new-ws-name" className={labelCls}>
            Name
          </label>
          <input id="new-ws-name" autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Client projects" maxLength={80} />
        </div>
        {error && <p className="text-xs text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold">
            Cancel
          </button>
          <button type="submit" disabled={busy || !name.trim()} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50">
            {busy ? 'Creating…' : 'Create workspace'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
