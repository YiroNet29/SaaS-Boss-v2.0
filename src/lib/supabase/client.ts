import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from './env';

let client: SupabaseClient | null = null;

/** True when the Supabase env vars are set. Without them the app still runs in demo mode. */
export const isSupabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_PUBLIC_KEY
);

/** Browser Supabase client (anon key + the signed-in user's session). */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  if (!client) {
    client = createBrowserClient(
      SUPABASE_URL,
      SUPABASE_PUBLIC_KEY
    );
  }
  return client;
}
