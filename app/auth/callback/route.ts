import { NextResponse, type NextRequest } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase/server';

/**
 * Supabase redirects here after Google sign-in, email confirmation and password-reset links.
 * We swap the one-time code for a session cookie, then send the user back into the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  // Only allow same-site relative redirects.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  if (code) {
    const supabase = await getRouteSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
    console.error('[auth/callback] exchange failed:', error.message);
  }

  return NextResponse.redirect(`${origin}/?auth_error=1`);
}
