import { test, expect, type Locator } from '@playwright/test';
import { newSession, signUp, nav, sql, q, ageLastConfirmation, PASSWORD, SERVICES, type Session, type Account } from './helpers';

// Keyboard use: Escape closes every dialog (only the topmost one), cancels "Confirm it's you", and can't
// dismiss the lock screen.
test.describe.configure({ mode: 'serial' });

let s: Session;
let a: Account;
test.beforeAll(async ({ browser }) => {
  s = await newSession(browser);
  a = await signUp(s.page, 'keyboard');
  await s.page.getByRole('button', { name: /Import Demo Stacks into Live/ }).click();
  await expect.poll(() => Number(sql(`select count(*) from service_links where workspace_id=${q(a.ws)}`))).toBeGreaterThan(10);
});
test.afterAll(async () => { await s?.ctx.close(); });
test.afterEach(() => { expect(s.errors.take(), 'errors in the page').toEqual([]); });

const escapeCloses = async (what: string, open: () => Promise<void>, inside: () => Locator) => {
  await open();
  await expect(inside(), `${what} opened`).toBeVisible();
  await s.page.keyboard.press('Escape');
  await expect(inside(), `Escape closes ${what}`).toHaveCount(0);
};

test('Escape closes each dialog', async () => {
  const { page } = s;
  await escapeCloses('the app form', async () => { await nav(page, 'Products'); await page.getByRole('button', { name: /Add Product/ }).first().click(); },
    () => page.getByPlaceholder('e.g. PharmaFlow or QuickBite POS'));
  await escapeCloses('the service form', async () => { await nav(page, SERVICES); await page.getByTitle('Edit service details').first().click(); },
    () => page.getByPlaceholder('Pro, Team, PayG'));
  await escapeCloses('quick add', async () => { await nav(page, SERVICES); await page.getByRole('button', { name: 'Add Service' }).first().click(); },
    () => page.getByLabel('Service name *'));
  await escapeCloses('the date form', async () => { await nav(page, 'Due Dates'); await page.getByRole('button', { name: 'Add Date' }).first().click(); },
    () => page.getByPlaceholder('e.g. Rotate Supabase Master Password'));
  await escapeCloses('the template picker', async () => { await nav(page, 'Products'); await page.getByRole('button', { name: /Use Template/ }).first().click(); },
    () => page.getByRole('heading', { name: /template/i }).filter({ visible: true }));
  await escapeCloses('Import & Export', async () => { await page.getByRole('button', { name: 'Import & Export' }).click(); },
    () => page.getByRole('heading', { name: /Import/ }).filter({ visible: true }));
  await escapeCloses('the command palette', async () => { await page.getByRole('button', { name: /^Command Palette/ }).click(); },
    () => page.getByPlaceholder(/Type a command/));
});

test("Escape cancels \"Confirm it's you\", and nothing is exported", async () => {
  const { page } = s;
  await nav(page, 'Dashboard');
  await ageLastConfirmation(page);
  let downloaded = false;
  page.once('download', () => { downloaded = true; });
  await page.getByRole('button', { name: 'Export CSV' }).first().click();
  const confirm = page.getByRole('dialog', { name: "Confirm it's you" });
  await expect(confirm).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(downloaded).toBe(false);
});

test('the lock screen stays locked on Escape', async () => {
  const { page } = s;
  await nav(page, 'Workspace Settings');
  await page.getByRole('button', { name: 'Lock now' }).click();
  const locked = page.getByRole('heading', { name: 'StackTrack is locked' });
  await locked.waitFor();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await expect(locked).toBeVisible();
  await page.getByLabel('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Unlock with password' }).click();
  await locked.waitFor({ state: 'detached' });
});
