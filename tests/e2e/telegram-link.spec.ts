import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { newSession, signUp, admin, localEnv, type Session, type Account } from './helpers';

// Only the server links a Telegram chat (/start with the one-time code, 0008_telegram_link_guard.sql).
// A signed-in account writing straight to the database must not be able to point its reminders, and the
// bot's receipts, at somebody else's chat.
let s: Session;
let a: Account;

test.beforeAll(async ({ browser }) => {
  s = await newSession(browser);
  a = await signUp(s.page, 'tglink');
});
test.afterAll(async () => { await s?.ctx.close(); });

test("an account can't link its workspace to someone else's Telegram chat from the browser", async () => {
  const env = localEnv();
  const user = createClient(env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  expect((await user.auth.signInWithPassword({ email: a.email, password: a.password })).error).toBeNull();
  const chatOf = async () =>
    (await admin().from('notification_settings').select('telegram_chat_id, digest_time').eq('workspace_id', a.ws).single()).data;

  // Writing a chat id is accepted but ignored: the row stays unlinked.
  expect((await user.from('notification_settings').upsert({ workspace_id: a.ws, telegram_chat_id: '123456789', telegram_enabled: true })).error).toBeNull();
  expect((await chatOf())?.telegram_chat_id).toBe('');
  expect((await user.from('notification_settings').update({ telegram_chat_id: '123456789' }).eq('workspace_id', a.ws)).error).toBeNull();
  expect((await chatOf())?.telegram_chat_id).toBe('');

  // Everything else in the row is still yours to change.
  expect((await user.from('notification_settings').update({ digest_time: '07:00' }).eq('workspace_id', a.ws)).error).toBeNull();
  expect((await chatOf())?.digest_time).toBe('07:00');

  // The server links it (as /start does), and a browser write can't change or clear that either.
  expect((await admin().from('notification_settings').update({ telegram_chat_id: '777' }).eq('workspace_id', a.ws)).error).toBeNull();
  await user.from('notification_settings').update({ telegram_chat_id: '555' }).eq('workspace_id', a.ws);
  await user.from('notification_settings').upsert({ workspace_id: a.ws, telegram_chat_id: '' });
  expect((await chatOf())?.telegram_chat_id).toBe('777');
});
