import { test, expect } from '@playwright/test';
import { newSession, signUp, nav, admin, localEnv, isoDay, SERVICES, type Session, type Account } from './helpers';
import { TelegramStandIn } from './telegram-standin';

// The live Telegram setup (README steps), rehearsed against a pretend Telegram:
// set up the bot, connect, test message, a reminder with ✅ Paid, receipts, /month and /due.
test.describe.configure({ mode: 'serial' });

// A new chat each run: chats linked by earlier runs on the same local database don't get in the way.
const tg = new TelegramStandIn(100_000_000 + (Date.now() % 800_000_000));
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
  expect(tg.commands).toEqual(expect.arrayContaining(['due', 'month', 'add']));
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

test('/add: a service sent from Telegram goes into the app picked, and shows up without reloading', async () => {
  const { page } = s;
  const db = admin();
  expect((await db.from('products').insert({ id: `prod2-${a.ws}`, workspace_id: a.ws, name: 'Hotel POS' })).error).toBeNull();
  await nav(page, SERVICES);
  await page.reload(); // pick up the new app
  await nav(page, SERVICES);

  // Named app: added straight away.
  await tg.say('/add Supabase Pro 25 USD monthly 2026-12-15 for hotel');
  await tg.waitForMessage((m) => /Added <b>Supabase \(Pro\)/.test(m.text), '"Added Supabase"');
  await expect(page.getByText('Supabase', { exact: true }).filter({ visible: true }).first()).toBeVisible();

  // No app named: buttons; the tap adds it and replaces the question.
  await tg.say('/add Vercel Pro 20 USD monthly');
  const question = await tg.waitForMessage((m) => /Which app is <b>Vercel<\/b> for/.test(m.text), 'the app question');
  await tg.tap(question, tg.button(question, /^SaaS Boss$/));
  await expect.poll(() => tg.answers.at(-1)?.text).toBe('Added to SaaS Boss');
  expect(question.text).toMatch(/✅ Added <b>Vercel \(Pro\) · \$20 .* a month<\/b> to <b>SaaS Boss<\/b>/);
  await expect(page.getByText('Vercel', { exact: true }).filter({ visible: true }).first()).toBeVisible();

  const { data } = await db
    .from('service_links')
    .select('provider_name, plan, cost, currency, billing_cycle, renewal_date, product_id, category')
    .eq('workspace_id', a.ws)
    .like('id', 'svc-tg-%')
    .order('provider_name');
  expect(data).toEqual([
    { provider_name: 'Supabase', plan: 'Pro', cost: 25, currency: 'USD', billing_cycle: 'monthly', renewal_date: '2026-12-15', product_id: `prod2-${a.ws}`, category: 'database' },
    { provider_name: 'Vercel', plan: 'Pro', cost: 20, currency: 'USD', billing_cycle: 'monthly', renewal_date: null, product_id: `prod-${a.ws}`, category: 'hosting' },
  ]);
});

test('quarterly check: the hourly job asks once a quarter; 🛑 Cancel marks the service cancelled', async () => {
  const runJob = () =>
    fetch('http://localhost:3210/api/cron/reminders?force=1&review=1', { headers: { Authorization: `Bearer ${localEnv().CRON_SECRET}` } });
  expect((await runJob()).status).toBe(200);
  const review = await tg.waitForMessage((m) => /Quarterly check/.test(m.text) && Boolean(m.reply_markup), 'the quarterly check');
  expect(review.text).toMatch(/1\. <b>Supabase \(Pro\)<\/b> · Hotel POS/); // $25 a month: the priciest first

  await tg.tap(review, tg.button(review, /^🛑 Cancel #1$/));
  await expect.poll(() => tg.answers.at(-1)?.text ?? '').toMatch(/Cancelled in StackTrack\. Cancel it at Supabase too/);
  const { data } = await admin().from('service_links').select('status, auto_renew').eq('workspace_id', a.ws).eq('provider_name', 'Supabase').single();
  expect(data).toEqual({ status: 'cancelled', auto_renew: false });

  const asked = tg.sent.filter((m) => String(m.chat_id) === String(tg.chatId) && /Quarterly check/.test(m.text)).length;
  expect((await runJob()).status).toBe(200);
  expect(tg.sent.filter((m) => String(m.chat_id) === String(tg.chatId) && /Quarterly check/.test(m.text)).length).toBe(asked);
});

const runJobWith = (query: string) =>
  fetch(`http://localhost:3210/api/cron/reminders?force=1${query}`, { headers: { Authorization: `Bearer ${localEnv().CRON_SECRET}` } });
const sentToMe = (re: RegExp) => tg.sent.filter((m) => String(m.chat_id) === String(tg.chatId) && re.test(m.text)).length;

test('budget: set on the app form, shown on its page; Telegram alerts once at 80%', async () => {
  const { page } = s;
  const db = admin();
  const month = new Date().toISOString().slice(0, 7);
  const { data: svcs } = await db.from('service_links').select('id').eq('product_id', `prod-${a.ws}`);
  const ids = new Set((svcs ?? []).map((x: { id: string }) => x.id));
  const { data: pays } = await db.from('payments').select('amount, currency, paid_on, service_link_id').eq('workspace_id', a.ws);
  const spent = (pays ?? [])
    .filter((p: any) => p.paid_on.startsWith(month) && ids.has(p.service_link_id) && p.currency === 'USD')
    .reduce((sum: number, p: any) => sum + Number(p.amount), 0);
  expect(spent, 'the ✅ Paid test recorded a payment this month').toBeGreaterThan(0);
  const budget = Math.ceil(spent / 0.9); // about 90% used

  await nav(page, 'Products');
  await page.getByText('SaaS Boss', { exact: true }).first().click();
  await page.getByTitle('Edit product info').click();
  await page.locator('#monthly-budget').fill(String(budget));
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect
    .poll(async () => Number((await db.from('products').select('monthly_budget').eq('id', `prod-${a.ws}`).single()).data?.monthly_budget))
    .toBe(budget);
  const use = page.getByLabel('Budget this month');
  await expect(use).toContainText(new RegExp(`This month: \\$[\\d.,]+ of \\$${budget} budget \\(\\d+%\\)`));
  await expect(use.getByRole('progressbar', { name: 'Budget used' })).toBeVisible();

  expect((await runJobWith('')).status).toBe(200);
  const alert = await tg.waitForMessage((m) => /Budget · /.test(m.text), 'a budget alert');
  expect(alert.text).toMatch(new RegExp(`SaaS Boss: \\$[\\d.,]+ \\(≈ ETB [\\d,]+\\) paid this month, \\d+% of its \\$${budget} budget\\.`));
  const before = sentToMe(/Budget · /);
  expect((await runJobWith('')).status).toBe(200);
  expect(sentToMe(/Budget · /), 'each level is sent once a month').toBe(before);
});

test('weekly style: one message on Monday with the week ahead, sent once', async () => {
  const db = admin();
  expect((await db.from('notification_settings').update({ digest_mode: 'weekly' }).eq('workspace_id', a.ws)).error).toBeNull();
  expect(
    (await db.from('important_dates').insert({ id: `date-week-${a.ws}`, workspace_id: a.ws, title: 'File the VAT return', type: 'custom', due_date: isoDay(3) })).error
  ).toBeNull();
  expect((await runJobWith('&monday=1')).status).toBe(200);
  const week = await tg.waitForMessage((m) => /The week ahead · /.test(m.text), 'the weekly digest');
  expect(week.text).toMatch(/File the VAT return/);
  const sent = sentToMe(/The week ahead · /);
  expect((await runJobWith('&monday=1')).status).toBe(200);
  expect(sentToMe(/The week ahead · /), 'sent once per Monday').toBe(sent);

  // On other days the weekly style sends no renewals or dates.
  const body = await (await runJobWith('')).json();
  const mine = body.workspaces.find((w: { workspaceId: string }) => w.workspaceId === a.ws);
  expect(mine.weekly).toMatch(/waits for Monday|already sent today/);
});
