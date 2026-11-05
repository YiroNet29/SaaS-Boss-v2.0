import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type SecurityAction =
  | 'sign_in'
  | 'unlock'
  | 'unlock_failed'
  | 'export'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'mfa_device_added'
  | 'mfa_device_removed'
  | 'passkey_added'
  | 'passkey_removed'
  | 'telegram_linked';

/** The workspace a user's security events are filed under (their first owned workspace). */
export async function primaryWorkspaceId(admin: SupabaseClient, uid: string): Promise<string | null> {
  const { data } = await admin
    .from('workspaces')
    .select('id')
    .eq('owner_id', uid)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** Writes a security event to the activity log. Never throws (logging must not break the action). */
export async function recordSecurityEvent(
  admin: SupabaseClient,
  uid: string,
  action: SecurityAction,
  details: string,
  changedBy = 'you'
): Promise<string | null> {
  try {
    const workspaceId = await primaryWorkspaceId(admin, uid);
    if (!workspaceId) return null;
    await admin.from('audit_logs').insert({
      id: `audit-${crypto.randomUUID().slice(0, 12)}`,
      workspace_id: workspaceId,
      item_type: 'security',
      item_id: uid,
      action,
      changed_by: changedBy,
      details: details.slice(0, 300),
    });
    return workspaceId;
  } catch {
    return null;
  }
}

/** Failed unlocks in the last `minutes` (for the "5 wrong attempts → signed out" rule). */
export async function recentFailedUnlocks(admin: SupabaseClient, uid: string, minutes = 15): Promise<number> {
  const workspaceId = await primaryWorkspaceId(admin, uid);
  if (!workspaceId) return 0;
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data } = await admin
    .from('audit_logs')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('item_type', 'security')
    .eq('action', 'unlock_failed')
    .gt('timestamp', since);
  return (data ?? []).length;
}
