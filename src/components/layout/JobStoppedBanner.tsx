import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useJobStatus } from '../../hooks/useJobStatus';
import { ago, hourlyJobHealth } from '../../utils/jobStatus';

/** Shown when the hourly job ran before but hasn't for 3 hours or more: reminders aren't going out. */
export const JobStoppedBanner: React.FC<{ onOpenSettings: () => void }> = ({ onOpenSettings }) => {
  const { isDemoMode } = useWorkspace();
  const { status, missing } = useJobStatus();
  if (isDemoMode || missing) return null;
  const job = hourlyJobHealth(status, new Date());
  if (job.health !== 'stopped') return null;
  return (
    <div role="alert" className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center gap-2">
      <span className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
        <span>
          Reminders aren't going out: the hourly job last ran {ago(job.minutesAgo!)}. Check the job on cron-job.org.
        </span>
      </span>
      <button type="button" onClick={onOpenSettings} className="sm:ml-auto px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 font-semibold shrink-0">
        Open Status
      </button>
    </div>
  );
};
