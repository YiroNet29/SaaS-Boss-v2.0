import { NextResponse, type NextRequest } from 'next/server';
import { appOrigin, requireUser } from '@/lib/auth-server';
import { BOT_COMMANDS, isValidWebhookSecret, tg } from '@/lib/telegram';
import { getTelegramStatus } from '@/lib/telegram-status';

export const dynamic = 'force-dynamic';

/**
 * Signed-in only: points the bot's webhook at this deployment (with the secret token), sets the
 * command menu, and returns the fresh status. Replaces the manual setWebhook curl step.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if ('response' in auth) return auth.response;

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json({ error: 'Add TELEGRAM_BOT_TOKEN in Vercel, then redeploy.' }, { status: 400 });
    }
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!isValidWebhookSecret(secret)) {
      return NextResponse.json(
        { error: 'TELEGRAM_WEBHOOK_SECRET is missing or has characters Telegram rejects. Use only letters, numbers, _ and -.' },
        { status: 400 }
      );
    }

    const origin = appOrigin(request);
    await tg('setWebhook', {
      url: `${origin}/api/telegram/webhook`,
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
    });
    await tg('setMyCommands', { commands: BOT_COMMANDS });
    return NextResponse.json(await getTelegramStatus(origin));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
