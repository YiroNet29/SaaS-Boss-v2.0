import { NextResponse, type NextRequest } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/server';
import { safeEqual } from '@/lib/reminders-server';
import { tg } from '@/lib/telegram';
import { handleTelegramUpdate } from '@/lib/telegram-bot';

export const dynamic = 'force-dynamic';

/**
 * Telegram bot webhook. Registered from Settings → Telegram → "Set up bot"
 * (or manually with setWebhook + secret_token, see README).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const header = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!secret || !safeEqual(header, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const update = await request.json().catch(() => null);
  try {
    await handleTelegramUpdate(update, { admin: getAdminSupabase(), tg, appUrl: process.env.NEXT_PUBLIC_APP_URL });
  } catch (err) {
    // Always answer 200 so Telegram doesn't redeliver the same update in a loop.
    console.error('[telegram/webhook]', err);
  }
  return NextResponse.json({ ok: true });
}

export function GET() {
  return new NextResponse('StackTrack Telegram webhook is running.', { status: 200 });
}
