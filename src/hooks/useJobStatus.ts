import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../lib/supabase/client';
import { useWorkspace } from '../context/WorkspaceContext';
import type { JobStatus } from '../utils/jobStatus';

/**
 * What the hourly job last did for the current live workspace (workspaces.job_status), read fresh and
 * again every 10 minutes. `missing`: migration 0006 hasn't been run, so nothing is recorded.
 */
export function useJobStatus() {
  const { currentWorkspace, isDemoMode } = useWorkspace();
  const [status, setStatus] = useState<JobStatus | undefined>(undefined);
  const [missing, setMissing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (isDemoMode) return;
    const { data, error } = await getSupabase().from('workspaces').select('job_status').eq('id', currentWorkspace.id).maybeSingle();
    if (error) {
      setMissing(error.code === '42703' || /job_status/.test(error.message));
      setStatus(undefined);
    } else {
      setMissing(false);
      setStatus(((data as { job_status?: JobStatus } | null)?.job_status ?? {}) as JobStatus);
    }
    setLoaded(true);
  }, [currentWorkspace.id, isDemoMode]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10 * 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { status, missing, loaded, refresh };
}
