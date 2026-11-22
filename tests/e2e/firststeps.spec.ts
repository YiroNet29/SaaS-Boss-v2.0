import { test, expect } from '@playwright/test';
import { newSession, signUp, nav, sql, q, SERVICES, type Session, type Account } from './helpers';

// A brand-new account: every empty page says what to add first and has the button for it.
test.describe.configure({ mode: 'serial' });

let s: Session;
let a: Account;
test.beforeAll(async ({ browser }) => {
  s = await newSession(browser);
  a = await signUp(s.page, 'firststeps');
});
test.afterAll(async () => { await s?.ctx.close(); });
test.afterEach(() => { expect(s.errors.take(), 'errors in the page').toEqual([]); });

const getStarted = () => s.page.getByRole('region', { name: 'Get started' });

test('the dashboard lists the first steps; the health check has nothing to grade yet', async () => {
  const { page } = s;
  await expect(getStarted()).toBeVisible();
  await expect(getStarted()).toContainText('0 of 4 done. Next: add an app you run.');
  await expect(page.getByText('Nothing to check yet.')).toBeVisible();
  await expect(page.getByText(/Grade A\+/)).toHaveCount(0);
});

test('empty Services and Dates say what to add, not "nothing matches these filters"', async () => {
  const { page } = s;
  await nav(page, SERVICES);
  await expect(page.getByRole('heading', { name: 'No services yet' })).toBeVisible();
  await expect(page.getByText(/send \/add Vercel 20 monthly to the Telegram bot/)).toBeVisible();
  await nav(page, 'Due Dates');
  await expect(page.getByRole('heading', { name: 'No dates yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add a date' })).toBeVisible();
});

test('each step button does its job, and done steps are ticked', async () => {
  const { page } = s;
  await nav(page, 'Dashboard');
  await getStarted().getByRole('button', { name: 'Add app', exact: true }).click();
  await page.getByPlaceholder('e.g. PharmaFlow or QuickBite POS').fill('First App');
  await page.getByRole('button', { name: 'Create App' }).click();
  await expect.poll(() => sql(`select count(*) from products where workspace_id=${q(a.ws)}`)).toBe('1');
  await nav(page, 'Dashboard');
  await expect(getStarted()).toContainText('1 of 4 done. Next: add what it pays for.');
  await expect(getStarted().getByRole('listitem', { name: /Step 1: Add an app you run \(done\)/ })).toBeVisible();

  await getStarted().getByRole('button', { name: 'Add service', exact: true }).click();
  await page.getByLabel('Service name *').fill('Railway');
  await page.getByLabel('Cost', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Save service' }).click();
  await expect.poll(() => sql(`select count(*) from service_links where workspace_id=${q(a.ws)}`)).toBe('1');
  await expect(getStarted()).toContainText('2 of 4 done');
  await expect(page.getByText('Nothing to check yet.')).toHaveCount(0);

  await getStarted().getByRole('button', { name: 'Add card or person' }).click();
  await expect(page.getByRole('heading', { name: /Cards & Payments/ }).first()).toBeVisible();
  await nav(page, 'Dashboard');
  await getStarted().getByRole('button', { name: 'Connect Telegram' }).click();
  // Settings opens at its Telegram section.
  await expect(page.locator('#telegram-settings')).toBeInViewport();
});

test('a search that matches nothing offers to clear the filters', async () => {
  const { page } = s;
  await nav(page, SERVICES);
  await page.getByPlaceholder('Search provider, product, category, notes...').fill('zzz-nothing');
  await expect(page.getByRole('heading', { name: 'No services match' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByText('Railway', { exact: true }).filter({ visible: true }).first()).toBeVisible();
});
