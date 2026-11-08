import { test, expect } from '@playwright/test';
import { newSession, signUp, sql, q, nav, admin, watchErrors, type Session, type Account } from './helpers';

// Live updates (two tabs, and changes made by the bot or hourly job) and saving changes made offline.
test.describe.configure({ mode: 'serial' });

let s: Session;
let a: Account;

test.beforeAll(async ({ browser }) => {
  s = await newSession(browser);
  a = await signUp(s.page, 'live');
});
test.afterAll(async () => { await s?.ctx.close(); });
test.afterEach(() => { expect(s.errors.take(), 'errors in the page').toEqual([]); });

test('two tabs: a date added in one appears in the other without reloading', async () => {
  const { page, ctx } = s;
  const other = await ctx.newPage();
  const otherErrors = watchErrors(other, 'tab 2');
  await other.goto('/', { waitUntil: 'networkidle' });
  await other.getByText("Yirael's Workspace").first().waitFor({ timeout: 20000 });
  await nav(other, 'Due Dates');

  await nav(page, 'Due Dates');
  await page.getByRole('button', { name: 'Add Date' }).first().click();
  await page.getByPlaceholder('e.g. Rotate Supabase Master Password').fill('Made in tab one');
  await page.getByRole('button', { name: 'Add Due Date' }).click();
  await expect(other.getByText('Made in tab one')).toBeVisible();
  expect(otherErrors.take()).toEqual([]);
  await other.close();
});

test('a date added from outside (the bot or the hourly job) appears without reloading', async () => {
  const { page } = s;
  const { error } = await admin().from('important_dates').insert({
    id: `outside-${Date.now()}`, workspace_id: a.ws, type: 'custom', title: 'Pushed from outside', due_date: '2027-02-01', recurrence: 'none', status: 'open', source: 'manual',
  });
  expect(error).toBeNull();
  await expect(page.getByText('Pushed from outside')).toBeVisible();
});

test('offline: a product made while offline is saved when the connection comes back', async () => {
  const { page, ctx } = s;
  // The browser reports the dropped requests; that is the point of this test.
  s.errors.allow(/ERR_INTERNET_DISCONNECTED|Failed to fetch|NetworkError|network/i);
  await nav(page, 'Products');
  await ctx.setOffline(true);
  await expect(page.getByText(/Offline/).first()).toBeVisible();
  await page.getByRole('button', { name: /Add Product/ }).first().click();
  await page.getByPlaceholder('e.g. PharmaFlow or QuickBite POS').fill('Made Offline');
  await page.getByRole('button', { name: 'Create App' }).click();
  await expect(page.getByRole('status').filter({ hasText: /waiting/i }).first()).toBeVisible();
  expect(sql(`select count(*) from products where workspace_id=${q(a.ws)} and name='Made Offline'`)).toBe('0');

  await ctx.setOffline(false);
  await expect(page.getByText(/Back online: \d+ changes? saved/)).toBeVisible({ timeout: 30000 });
  expect(sql(`select count(*) from products where workspace_id=${q(a.ws)} and name='Made Offline'`)).toBe('1');
});
