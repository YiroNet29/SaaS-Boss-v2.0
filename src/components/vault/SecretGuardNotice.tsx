import React from 'react';
import { ShieldAlert, ExternalLink } from 'lucide-react';
import { detectSecretInText } from '../../utils/secrets';
import { useWorkspace } from '../../context/WorkspaceContext';

interface SecretGuardNoticeProps {
  text: string;
}

export const SecretGuardNotice: React.FC<SecretGuardNoticeProps> = ({ text }) => {
  const { currentWorkspace } = useWorkspace();
  const detection = detectSecretInText(text);

  if (!detection.hasSecret) return null;

  return (
    <div className="mt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1">
      <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-semibold text-amber-300">
          Secret Pattern Detected: {detection.matchedPattern}
        </p>
        <p className="mt-0.5 text-amber-200/90 leading-relaxed">
          {detection.warningMessage}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <a
            href={currentWorkspace.vaultBaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 underline underline-offset-2 hover:text-amber-300"
          >
            Open Vault ({currentWorkspace.vaultBaseUrl})
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
};
