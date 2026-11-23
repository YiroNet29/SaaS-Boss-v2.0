import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase/client';
import { SECURITY_EVENT } from '../../lib/api-client';
import { useWorkspace } from '../../context/WorkspaceContext';
import type { SecurityEventRow } from '../../utils/settingsPages';

/**
 * The latest security events (sign-ins, unlocks, exports, 2FA / passkey / Telegram changes), refreshed
 * shortly after each new one. `enabled` false: nothing is loaded (rows stay null).
 */
export function useSecurityEvents(enabled = true) {
  const { currentWorkspace } = useWorkspace();
  const [rows, setRows] = useState<SecurityEventRow[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await getSupabase()
      .from('audit_logs')
      .select('id, action, details, changed_by, timestamp')
      .eq('workspace_id', currentWorkspace.id)
      .eq('item_type', 'security')
      .order('timestamp', { ascending: false })
      .limit(20);
    setRows((data as SecurityEventRow[]) ?? []);
  }, [currentWorkspace.id]);

  useEffect(() => {
    if (!enabled) return;
    load();
    // Events are recorded in the background; refresh shortly after each one.
    const onEvent = () => setTimeout(load, 800);
    window.addEventListener(SECURITY_EVENT, onEvent);
    return () => window.removeEventListener(SECURITY_EVENT, onEvent);
  }, [load, enabled]);

  return { rows, load };
}
