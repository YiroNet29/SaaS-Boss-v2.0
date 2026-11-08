import { test, expect } from '@playwright/test';
import { newSession, signUp, nav, admin, localEnv, isoDay, type Session, type Account } from './helpers';
import { TelegramStandIn } from './telegram-standin';

// The live Telegram setup (README steps), rehearsed against a pretend Telegram:
// set up the bot, connect, test message, a reminder with ✅ Paid, receipts, /month and /due.
test.describe.configure({ mode: 'serial' });

const tg = new TelegramStandIn();
let s: Session;
let a: Account;

test.beforeAll(async ({ browser }) => {
  await tg.start();
  s = await newSession(browser);
  await s.ctx.route('https://t.me/**', (r) => r.fulfill({ contentType: 'text/html', body: 'telegram' }));
  // Live-update notices disappear after a few seconds; keep a record of each one.
  await s.ctx.addInitScript(() => {
    (window as unknown as { __toasts: string[] }).__toasts = [];
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('[role=status]')) {
        const t = el.textContent || '';
        const seen = (window as unknown as { __toasts: string[] }).__toasts;
        if (/Telegram/.test(t) && !seen.includes(t)) seen.push(t);
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  a = await signUp(s.page, 'telegram');
});
test.afterAll(async () => {
  await s?.ctx.close();
  await tg.stop();
});
test.afterEach(() => { expect(s.errors.take(), 'errors in the page').toEqual([]); });

const toastSeen = (text: string) =>
  expect.poll(() => s.page.evaluate((x) => (window as unknown as { __toasts: string[] }).__toasts.some((t) => t.includes(x)), text), { message: `a notice "${text}"` }).toBe(true);

test('set up the bot from Settings: webhook and command menu', async () => {
  const { page } = s;
  await nav(page, 'Workspace Settings');
  await page.getByRole('button', { name: 'Set up bot' }).click();
  await page.getByRole('button', { name: 'Run setup again' }).waitFor({ timeout: 15000 });
  expect(tg.webhook).toBe('http://localhost:3210/api/telegram/webhook');
  expect(tg.secret).toBeTruthy();
  expect(tg.commands).toEqual(expect.arrayContaining(['due', 'month']));
});

test('connect Telegram: /start with the code links this chat; the code only works once', async () => {
  const { page } = s;
  await page.getByRole('button', { name: /Connect Telegram/ }).click();
  let code = '';
  await expect
    .poll(async () => {
      const { data } = await admin().from('notification_settings').select('telegram_verification_code').eq('workspace_id', a.ws).maybeSingle();
      code = data?.telegram_verification_code ?? '';
      return code;
    })
    .not.toBe('');
  await tg.say(`/start ${code}`);
  await tg.waitForMessage((m) => /Connected to StackTrack/.test(m.text), '"Connected to StackTrack"');
  await page.getByRole('button', { name: /Re-link/ }).waitFor({ timeout: 15000 });
  const { data } = await admin().from('notification_settings').select('telegram_chat_id, telegram_verification_code').eq('workspace_id', a.ws).single();
  expect(String(data.telegram_chat_id)).toBe(String(tg.chatId));
  expect(data.telegram_verification_code).toBeFalsy();

  const before = tg.sent.length;
  await tg.say(`/start ${code}`);
  await expect.poll(() => tg.sent.length).toBe(before + 1);
  expect(tg.sent.at(-1)!.text).not.toMatch(/Connected to StackTrack/);
});

test('Send test reaches Telegram', async () => {
  await s.page.getByRole('button', { name: 'Send test' }).click();
  await tg.waitForMessage((m) => /Test reminder/.test(m.text), 'a test reminder');
});

test('the hourly job sends a reminder; ✅ Paid records the payment and moves the renewal on', async () => {
  const { page } = s;
  const due = isoDay(7);
  const db = admin();
  expect((await db.from('products').insert({ id: `prod-${a.ws}`, workspace_id: a.ws, name: 'SaaS Boss' })).error).toBeNull();
  expect((await db.from('payment_sources').insert({ id: `src-${a.ws}`, workspace_id: a.ws, name: 'Grey', kind: 'card', currency: 'USD', prepaid: true, opening_balance: 40, last4: '4821' })).error).toBeNull();
  expect(
    (await db.from('service_links').insert({
      id: `svc-${a.ws}`, workspace_id: a.ws, product_id: `prod-${a.ws}`, provider_name: 'Neon', billing_cycle: 'monthly', cost: 19, currency: 'USD',
      renewal_date: due, auto_renew: false, status: 'active', payment_source_id: `src-${a.ws}`,
    })).error
  ).toBeNull();
  await nav(page, 'Cards & Payments');

  const cron = await fetch('http://localhost:3210/api/cron/reminders?force=1', { headers: { Authorization: `Bearer ${localEnv().CRON_SECRET}` } });
  expect(cron.status).toBe(200);
  const reminder = await tg.waitForMessage((m) => /Neon/.test(m.text) && Boolean(m.reply_markup), 'a reminder about Neon with buttons');
  await tg.tap(reminder, tg.button(reminder, /Paid/));
  await expect.poll(() => tg.answers.length).toBeGreaterThan(0);
  await toastSeen('payment was recorded from Telegram');

  const { data: pays } = await db.from('payments').select('amount, source_id').eq('workspace_id', a.ws);
  expect(pays).toEqual([{ amount: 19, source_id: `src-${a.ws}` }]);
  const { data: svc } = await db.from('service_links').select('renewal_date').eq('id', `svc-${a.ws}`).single();
  expect(svc.renewal_date > due).toBe(true);
});

test('receipts: a photo is saved and shows up live; a forwarded email is read and saved with one tap', async () => {
  const { page } = s;
  await nav(page, 'Receipts');
  await tg.say(undefined, { caption: 'neon', photo: [{ file_id: 'ph-small', file_size: 10 }, { file_id: 'ph-big', file_size: 22 }] });
  await tg.waitForMessage((m) => /Receipt saved/.test(m.text), '"Receipt saved"');
  await toastSeen('New receipt from Telegram');
  await expect(page.getByText('Automatic reading is off').first()).toBeVisible();
  const { data: stored } = await admin().from('receipts').select('storage_path').eq('workspace_id', a.ws).eq('channel', 'telegram');
  expect(stored?.[0]?.storage_path).toMatch(new RegExp(`^${a.ws}/`));

  await tg.say('From: Vercel Billing <billing@vercel.com>\nAmount paid $20.00 on Nov 5, 2026\nVisa ending in 4821', { forward_origin: { type: 'user' } });
  const read = await tg.waitForMessage((m) => /Receipt read/.test(m.text), '"Receipt read"');
  const answered = tg.answers.length;
  await tg.tap(read, tg.button(read, /Save/));
  await expect.poll(() => tg.answers.length).toBe(answered + 1);
  await expect
    .poll(async () => (await admin().from('payments').select('amount').eq('workspace_id', a.ws).eq('amount', 20)).data?.length)
    .toBe(1);
});

test('/month and /due answer', async () => {
  await tg.say(`/month ${new Date().toISOString().slice(0, 7)}`);
  await tg.waitForMessage((m) => /📊/.test(m.text), 'a monthly summary');
  await tg.say('/due');
  await tg.waitForMessage((m) => /Due in the next 30 days|Nothing due/.test(m.text), 'what is due');
});
