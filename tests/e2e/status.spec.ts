import { test, expect } from '@playwright/test';
import { newSession, signUp, sql, q, nav, admin, localEnv, isoDay, type Session, type Account } from './helpers';
import { APP } from './ports';

// Settings → Status and the "reminders stopped" banner (workspaces.job_status, migration 0006).
// Nothing listens on the pretend Telegram's port in this file, so a Telegram send fails on purpose.
test.describe.configure({ mode: 'serial' });

let s: Session;
let a: Account;
const runHourlyJob = async () => {
  const res = await fetch(`${APP}/api/cron/reminders?force=1`, { headers: { Authorization: `Bearer ${localEnv().CRON_SECRET}` } });
  expect(res.status).toBe(200);
  return res.json();
};
const status = () => s.page.locator('section[aria-labelledby="status-title"]');

test.beforeAll(async ({ browser }) => {
  s = await newSession(browser);
  a = await signUp(s.page, 'status');
  await nav(s.page, 'Workspace Settings');
});
test.afterAll(async () => {
  await admin().from('notification_settings').update({ telegram_enabled: false, telegram_chat_id: '' }).eq('workspace_id', a.ws);
  await s?.ctx.close();
});
test.afterEach(() => { expect(s.errors.take(), 'errors in the page').toEqual([]); });

test('a new workspace: the hourly job has never run', async () => {
  await expect(status()).toContainText('Has never run');
  await expect(status()).toContainText('No domain or SSL dates are checked automatically');
});

test('after the hourly job runs, Status says so', async () => {
  const body = await runHourlyJob();
  expect(String(body.jobStatus)).toMatch(/^recorded for \d+ workspaces$/);
  await s.page.getByRole('button', { name: 'Refresh status' }).click();
  await expect(status()).toContainText('Ran just now');
  expect(sql(`select job_status ? 'hourlyRanAt' from workspaces where id=${q(a.ws)}`)).toBe('t');
});

test('a failed Telegram send shows with its reason', async () => {
  const db = admin();
  // A new workspace has no settings row yet: create it, linked to a chat.
  expect(
    (await db.from('notification_settings').upsert({ workspace_id: a.ws, telegram_enabled: true, telegram_chat_id: '999000' }, { onConflict: 'workspace_id' })).error
  ).toBeNull();
  expect((await db.from('products').insert({ id: `prod-${a.ws}`, workspace_id: a.ws, name: 'Status App' })).error).toBeNull();
  expect(
    (await db.from('service_links').insert({
      id: `svc-${a.ws}`, workspace_id: a.ws, product_id: `prod-${a.ws}`, provider_name: 'Fly.io', billing_cycle: 'monthly', cost: 5, currency: 'USD',
      renewal_date: isoDay(7), auto_renew: false, status: 'active',
    })).error
  ).toBeNull();
  const body = await runHourlyJob();
  const mine = body.workspaces.find((w: { workspaceId: string }) => w.workspaceId === a.ws);
  expect(mine?.telegramError, `the send failed (nothing listens on the pretend Telegram port here): ${JSON.stringify(mine)}`).toBeTruthy();
  await s.page.getByRole('button', { name: 'Refresh status' }).click();
  await expect(status()).toContainText('Last message failed just now');
  await expect(status()).toContainText(String(mine.telegramError).slice(0, 20));
});

test('when the hourly job stops, a banner warns on every page', async () => {
  const fiveHoursAgo = new Date(Date.now() - 5 * 3600_000).toISOString();
  sql(`update workspaces set job_status = jsonb_set(job_status, '{hourlyRanAt}', to_jsonb(${q(fiveHoursAgo)}::text)) where id=${q(a.ws)}`);
  await s.page.reload({ waitUntil: 'networkidle' });
  const banner = s.page.getByRole('alert').filter({ hasText: "Reminders aren't going out" });
  await expect(banner).toContainText('5 hours ago');
  await nav(s.page, 'Dashboard');
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Open Status' }).click();
  await expect(status()).toContainText('Stopped: last ran 5 hours ago');

  await runHourlyJob();
  await s.page.reload({ waitUntil: 'networkidle' });
  await nav(s.page, 'Workspace Settings');
  await expect(status()).toContainText('Ran just now');
  await expect(banner).toHaveCount(0);
});
