import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isTelegramConfigured, sendTelegramMessage } from './telegram';
import { escapeHtml } from '../utils/telegramUi';

/** Sends a security alert to the workspace's linked Telegram chat, if any. Never throws. */
export async function sendSecurityAlert(admin: SupabaseClient, workspaceId: string | null, text: string): Promise<void> {
  if (!workspaceId || !isTelegramConfigured()) return;
  try {
    const { data } = await admin
      .from('notification_settings')
      .select('telegram_chat_id')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    const chatId = (data as { telegram_chat_id?: string } | null)?.telegram_chat_id;
    if (!chatId) return;
    const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    await sendTelegramMessage(chatId, {
      text: `${escapeHtml(text)}\n<i>${when}</i>\n\nNot you? Open StackTrack, sign out everywhere and change your password.`,
    });
  } catch {
    /* alerts must never break the action */
  }
}
