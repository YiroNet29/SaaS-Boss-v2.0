import { NextResponse } from 'next/server';
import { fetchUsdEtbRate } from '@/lib/fx-server';
import { rateLimited } from '@/lib/rate-limit';

/** Public USD->ETB rate (public data, cached 6 hours). Used by the app to refresh auto-mode rates. */
export async function GET(request: Request) {
  const limited = rateLimited(request, 'fx');
  if (limited) return limited;
  try {
    const quote = await fetchUsdEtbRate();
    return NextResponse.json(quote, {
      headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Rate lookup failed' },
      { status: 502 }
    );
  }
}
