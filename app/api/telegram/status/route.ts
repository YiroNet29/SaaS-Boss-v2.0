import { NextResponse, type NextRequest } from 'next/server';
import { appOrigin, requireUser } from '@/lib/auth-server';
import { getTelegramStatus } from '@/lib/telegram-status';
import { rateLimited } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** Signed-in only: bot token present, bot username, webhook connected, last delivery error. */
export async function GET(request: NextRequest) {
  const limited = rateLimited(request, 'telegram');
  if (limited) return limited;
  try {
    const auth = await requireUser(request);
    if ('response' in auth) return auth.response;
    return NextResponse.json(await getTelegramStatus(appOrigin(request)));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
