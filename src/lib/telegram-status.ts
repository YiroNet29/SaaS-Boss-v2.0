import 'server-only';
import { tg, isValidWebhookSecret } from './telegram';

export interface TelegramStatus {
  tokenSet: boolean;
  secretSet: boolean;
  secretValid: boolean;
  bot?: { username: string; name: string };
  webhook?: {
    url: string;
    expectedUrl: string;
    connected: boolean;
    pendingUpdates: number;
    lastError?: string;
    lastErrorAt?: string;
  };
  error?: string;
}

/** What the Settings checklist shows: token present, bot reachable, webhook pointing at this app. */
export async function getTelegramStatus(origin: string): Promise<TelegramStatus> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const status: TelegramStatus = {
    tokenSet: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    secretSet: Boolean(secret),
    secretValid: isValidWebhookSecret(secret),
  };
  if (!status.tokenSet) return status;

  try {
    const me = await tg<{ username: string; first_name: string }>('getMe');
    status.bot = { username: me.username, name: me.first_name };
    const info = await tg<{
      url: string;
      pending_update_count: number;
      last_error_message?: string;
      last_error_date?: number;
    }>('getWebhookInfo');
    const expectedUrl = `${origin}/api/telegram/webhook`;
    status.webhook = {
      url: info.url,
      expectedUrl,
      connected: info.url === expectedUrl,
      pendingUpdates: info.pending_update_count,
      lastError: info.last_error_message,
      lastErrorAt: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : undefined,
    };
  } catch (err) {
    status.error = err instanceof Error ? err.message : String(err);
  }
  return status;
}
