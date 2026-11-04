import React, { useState } from 'react';
import {
  KeyRound,
  X,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Layers,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';

interface VaultSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VaultSyncModal: React.FC<VaultSyncModalProps> = ({ isOpen, onClose }) => {
  const { currentWorkspace, services, syncFromVault, dates } = useWorkspace();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  // Collect all vault references across services
  const allVaultRefs = services.flatMap((s) =>
    (s.vaultRefs || []).map((ref) => ({
      ...ref,
      serviceProvider: s.providerName,
      serviceId: s.id,
      productId: s.productId,
    }))
  );

  const vaultSyncedDates = dates.filter((d) => d.source === 'vault');

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const res = await syncFromVault();
      setSyncStatus(`Successfully synchronized ${res.count} key rotation milestone(s) from Vault metadata endpoint.`);
    } catch {
      setSyncStatus('Failed to synchronize from Vault.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl relative text-slate-100 my-8 max-h-[90vh] overflow-y-auto space-y-5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">
              Vault Integration & Secret References
            </h3>
            <p className="text-xs text-slate-400">
              Zero secret storage architecture • Metadata & rotation sync only
            </p>
          </div>
        </div>

        {/* Guardrail Policy Architecture Callout */}
        <div className="p-4 rounded-xl bg-slate-850 border border-slate-750 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Strict Zero-Secret Security Contract</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            StackTrack <strong>never stores private keys, passwords, or secret tokens</strong>. Real credentials remain exclusively in your dedicated Vault service. StackTrack only stores opaque Vault Item IDs and deep-links to:
          </p>
          <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-slate-300">
            {currentWorkspace.vaultBaseUrl}/vault/api-keys/&lt;vaultItemId&gt;
          </div>
        </div>

        {/* Phase 2 Metadata Sync Stub */}
        <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-750 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-200">
                Phase 2: Metadata-Only Sync Engine
              </h4>
              <p className="text-[11px] text-slate-400">
                Mirrors <code className="text-indigo-300">next_rotation_due</code> and SSL expiry dates directly into Important Dates with source: "vault".
              </p>
            </div>

            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          </div>

          {syncStatus && (
            <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{syncStatus}</span>
            </div>
          )}
        </div>

        {/* Active Vault References List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
            <span>Linked Vault References ({allVaultRefs.length})</span>
            <span className="text-slate-500">{vaultSyncedDates.length} rotation dates synced</span>
          </div>

          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {!allVaultRefs.length ? (
              <div className="p-4 text-center text-xs text-slate-500 bg-slate-850 rounded-xl">
                No Vault item references linked yet. Edit any service link to attach a Vault ID.
              </div>
            ) : (
              allVaultRefs.map((ref, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-850 border border-slate-750 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-200">{ref.label}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                        {ref.vaultItemId}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Service: {ref.serviceProvider} ({ref.environment})
                    </div>
                  </div>

                  <a
                    href={`${currentWorkspace.vaultBaseUrl}/vault/api-keys/${ref.vaultItemId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-emerald-400 text-xs font-medium border border-slate-700"
                  >
                    <span>Open in Vault</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="pt-3 flex justify-end border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-750"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
