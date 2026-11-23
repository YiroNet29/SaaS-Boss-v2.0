import { test, expect } from '@playwright/test';
import { newSession, signUp, sql, q, nav, confirmIt, addVirtualAuthenticator, ageLastConfirmation, PASSWORD, type Session, type Account } from './helpers';

// App lock, passkeys (a virtual fingerprint reader), the security log, and settings that ask "Confirm it's you".
test.describe.configure({ mode: 'serial' });

let s: Session;
let a: Account;

test.beforeAll(async ({ browser }) => {
  s = await newSession(browser);
  await addVirtualAuthenticator(s.ctx, s.page);
  a = await signUp(s.page, 'security');
  await nav(s.page, 'Workspace Settings');
});
test.afterAll(async () => { await s?.ctx.close(); });
test.afterEach(() => { expect(s.errors.take(), 'errors in the page').toEqual([]); });

const locked = () => s.page.getByRole('heading', { name: 'StackTrack is locked' });

test('app lock: lock now, unlock with the password, back on the same page; the setting is kept', async () => {
  const { page } = s;
  await page.getByRole('button', { name: 'Lock now' }).click();
  await locked().waitFor();
  await page.getByLabel('Your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Unlock with password' }).click();
  await locked().waitFor({ state: 'detached' });
  await expect(page.locator('section[aria-labelledby="applock-title"]')).toBeVisible();

  const sel = page.locator('section[aria-labelledby="applock-title"] select');
  await sel.selectOption({ index: 0 });
  const value = await sel.inputValue();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('section[aria-labelledby="applock-title"] select')).toHaveValue(value);
});

test('passkey: add, unlock with fingerprint, remove (asks to confirm)', async () => {
  const { page } = s;
  await page.getByRole('button', { name: 'Add fingerprint / Face ID on this device' }).click();
  await expect.poll(() => sql(`select count(*) from user_passkeys where user_id=${q(a.uid)}`)).toBe('1');

  await page.getByRole('button', { name: 'Lock now' }).click();
  await locked().waitFor();
  await page.getByRole('button', { name: 'Unlock with fingerprint / Face ID' }).click();
  await locked().waitFor({ state: 'detached', timeout: 15000 });
  await expect.poll(() => Number(sql(`select counter from user_passkeys where user_id=${q(a.uid)}`))).toBeGreaterThan(0);
  expect(sql(`select count(*) from webauthn_challenges where user_id=${q(a.uid)}`)).toBe('0');

  // Right after unlocking it doesn't ask again; 5 minutes later it does.
  await ageLastConfirmation(page);
  await page.getByRole('button', { name: /Remove passkey/ }).click();
  const dlg = page.getByRole('dialog', { name: "Confirm it's you" });
  await dlg.getByRole('button', { name: 'Unlock with fingerprint / Face ID' }).click();
  await dlg.waitFor({ state: 'detached' });
  await expect.poll(() => sql(`select count(*) from user_passkeys where user_id=${q(a.uid)}`)).toBe('0');
});

test('security activity lists what happened', async () => {
  const { page } = s;
  await page.getByRole('button', { name: 'Refresh security activity' }).click();
  const log = page.locator('section', { has: page.getByRole('button', { name: 'Refresh security activity' }) });
  for (const event of ['Passkey added', 'Passkey removed', 'Unlocked with password', 'Unlocked with passkey']) {
    await expect(log, `security activity mentions "${event}"`).toContainText(event);
  }
});

test('settings: name, manual rate, backup email (asks to confirm), digest time, custom reminder day', async () => {
  const { page } = s;
  // Resetting to sample data is a demo-only tool.
  await expect(page.getByText('Restore the demo data')).toHaveCount(0);
  await page.locator('input[type=text][required]').first().fill('QA Studio');
  await page.getByRole('group', { name: 'Rate mode' }).getByRole('button').last().click();
  await page.locator('#etb-rate').fill('160.5');
  await page.locator('#backup-email').fill('backup@stacktrack.local');
  await page.locator('#digest-time').fill('09:00');
  const digest = await page.locator('#digest-time').inputValue();
  await page.getByPlaceholder('Add custom days...').fill('21');
  await page.getByPlaceholder('Add custom days...').press('Enter');
  await ageLastConfirmation(page);
  await page.getByRole('button', { name: 'Save Workspace Settings' }).click();
  await confirmIt(page);
  await expect
    .poll(() => sql(`select name || ' ' || (exchange_rates->>'ETB_per_USD') || ' ' || (21 = any(default_lead_days)) from workspaces where id=${q(a.ws)}`))
    .toBe('QA Studio 160.5 true');
  await expect.poll(() => sql(`select email || ' ' || digest_time from notification_settings where workspace_id=${q(a.ws)}`)).toContain('backup@stacktrack.local');
  expect(sql(`select digest_time from notification_settings where workspace_id=${q(a.ws)}`)).toContain(digest);
});

test('Send test with Telegram not linked says so', async () => {
  const { page } = s;
  await page.getByRole('button', { name: 'Send test' }).click();
  await expect(page.getByText(/Telegram is not linked yet/).first()).toBeVisible();
});
