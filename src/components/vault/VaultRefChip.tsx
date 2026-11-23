import React from 'react';
import { KeyRound, ExternalLink } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { vaultItemUrl } from '../../utils/vault';

const chip = 'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20';

/** A service's vault reference. Opens the key in the vault when the workspace has a vault address. */
export const VaultRefChip: React.FC<{ label: string; itemId: string; prefix?: string }> = ({ label, itemId, prefix = '' }) => {
  const { currentWorkspace } = useWorkspace();
  const href = vaultItemUrl(currentWorkspace.vaultBaseUrl, itemId);
  const body = (
    <>
      <KeyRound className="w-2.5 h-2.5" />
      <span>
        {prefix}
        {label}
      </span>
      {href && <ExternalLink className="w-2.5 h-2.5" />}
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={`${chip} hover:bg-emerald-500/20`} title="Open in your vault">
      {body}
    </a>
  ) : (
    <span className={chip} title={`Vault item ${itemId}. Add your vault's address in Settings to open it from here.`}>
      {body}
    </span>
  );
};
