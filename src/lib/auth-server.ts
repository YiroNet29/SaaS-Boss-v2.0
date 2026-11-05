import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminSupabase } from './supabase/server';

/**
 * For API routes the app calls on behalf of the signed-in user. The browser sends its Supabase
 * access token as "Authorization: Bearer <token>"; we check it with Supabase.
 * Returns either the user id + admin client, or a ready-made error response.
 */
export async function requireUser(
  request: NextRequest
): Promise<{ uid: string; email: string; admin: SupabaseClient } | { response: NextResponse }> {
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return { response: NextResponse.json({ error: 'Sign in first.' }, { status: 401 }) };
  const admin = getAdminSupabase();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return { response: NextResponse.json({ error: 'Your session has expired. Sign in again.' }, { status: 401 }) };
  }
  return { uid: data.user.id, email: data.user.email ?? '', admin };
}

/** The public base URL of this deployment (used for the Telegram webhook and links). */
export function appOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '');
  return configured || request.nextUrl.origin;
}
