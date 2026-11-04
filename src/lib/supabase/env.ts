/**
 * Supabase settings. Accepts both the classic names (ANON / SERVICE_ROLE) and the newer
 * ones (PUBLISHABLE / SECRET) that the Vercel <-> Supabase integration may create.
 * NEXT_PUBLIC_ values must be referenced literally so Next.js can inline them in the browser bundle.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

export const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

/** Server only. Never import this value into client code. */
export function getSupabaseSecretKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
}
