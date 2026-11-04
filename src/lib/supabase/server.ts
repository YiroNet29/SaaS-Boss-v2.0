import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL, getSupabaseSecretKey } from './env';

/**
 * Service-role client for trusted server jobs (cron, Telegram webhook).
 * Bypasses Row Level Security, so never use it with user-supplied workspace ids
 * without checking them first.
 */
export function getAdminSupabase(): SupabaseClient {
  const url = SUPABASE_URL;
  const key = getSupabaseSecretKey();
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) must be set.');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Cookie-based client for route handlers acting as the signed-in user (e.g. the OAuth callback). */
export async function getRouteSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    SUPABASE_URL,
    SUPABASE_PUBLIC_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        },
      },
    }
  );
}
