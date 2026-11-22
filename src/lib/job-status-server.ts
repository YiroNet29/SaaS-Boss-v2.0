import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { nextJobStatus, type JobStatus } from '@/utils/jobStatus';

/**
 * Records this run of the hourly job on every workspace (workspaces.job_status, migration 0006):
 * when it ran, this workspace's error if any, and the last Telegram success or failure.
 * Never throws: without the migration it just says so.
 */
export async function recordJobStatus(
  admin: SupabaseClient,
  results: Map<string, Record<string, unknown>>,
  nowIso: string
): Promise<string> {
  const { data, error } = await admin.from('workspaces').select('id, job_status');
  if (error) {
    return error.code === '42703' || /job_status/.test(error.message)
      ? 'not recorded: run supabase/migrations/0006_job_status.sql'
      : `not recorded: ${error.message}`;
  }
  const rows = (data ?? []) as { id: string; job_status: JobStatus | null }[];
  let failed = 0;
  for (let i = 0; i < rows.length; i += 10) {
    await Promise.all(
      rows.slice(i, i + 10).map(async (r) => {
        const next = nextJobStatus(r.job_status ?? {}, results.get(r.id), nowIso);
        const { error: upErr } = await admin.from('workspaces').update({ job_status: next }).eq('id', r.id);
        if (upErr) failed += 1;
      })
    );
  }
  return failed ? `recorded for ${rows.length - failed} of ${rows.length} workspaces` : `recorded for ${rows.length} workspaces`;
}
