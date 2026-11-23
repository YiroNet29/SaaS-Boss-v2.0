import { test, expect } from '@playwright/test';
import { newSession, signUp, sql, q, nav, confirmIt, totp, latestEmail, admin, localEnv, sleep, ageLastConfirmation, PASSWORD } from './helpers';
import { APP, SUPABASE_API } from './ports';

// Signing up, password reset, and two-factor login enforced by the database itself.

test('each new account gets exactly one workspace, even when the first load races', async ({ browser }) => {
  // This used to create two workspaces for about one new account in three.
  for (let i = 0; i < 4; i++) {
    const s = await newSession(browser);
    const a = await signUp(s.page, `race${i}`);
    await sleep(2500);
    expect(sql(`select count(*) from workspaces where owner_id=${q(a.uid)}`), `workspaces for account ${i + 1}`).toBe('1');
    expect(s.errors.take()).toEqual([]);
    await s.ctx.close();
  }
});

test('forgot password: the email link lets you set a new one, then sign in with it', async ({ browser }) => {
  const s = await newSession(browser);
  const { page } = s;
  const a = await signUp(page, 'reset');
  await page.getByRole('button', { name: /Sign out/ }).first().click();
  await page.getByPlaceholder('you@company.com').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByPlaceholder('you@company.com').fill(a.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();

  const mail = await latestEmail(a.email);
  const link = (mail.Text.match(/https?:\/\/\S+/) || [])[0];
  expect(link, 'a link in the reset email').toBeTruthy();
  await page.goto(link.replace(/&amp;/g, '&'), { waitUntil: 'networkidle' });
  await page.getByPlaceholder(/Password/).first().fill('a-brand-new-password');
  await page.getByRole('button', { name: 'Save password' }).click();
  await page.getByText("Yirael's Workspace").first().waitFor({ timeout: 20000 });

  await page.getByRole('button', { name: /Sign out/ }).first().click();
  await page.getByPlaceholder('you@company.com').fill(a.email);
  await page.getByPlaceholder('Password').fill('a-brand-new-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText("Yirael's Workspace").first().waitFor({ timeout: 20000 });
  expect(s.errors.take()).toEqual([]);
  await s.ctx.close();
});

test('two-factor login: the database refuses a password-only session; sign-in asks for the code; turning it off asks too', async ({ browser }) => {
  test.setTimeout(180_000); // waits for fresh 30-second codes, twice
  const s = await newSession(browser);
  const { page } = s;
  const a = await signUp(page, '2fa');
  const { error } = await admin().from('products').insert({ id: `prod-${a.ws}`, workspace_id: a.ws, name: 'Secret App' });
  expect(error).toBeNull();

  await nav(page, 'Workspace Settings');
  await page.getByRole('button', { name: 'Turn on' }).click();
  const secret = (await page.locator('code.select-all').innerText()).trim();
  await page.getByLabel('6-digit code from your authenticator app').fill(await totp(secret));
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(() => sql(`select count(*) from auth.mfa_factors where user_id=${q(a.uid)} and status='verified'`)).toBe('1');

  // Someone with only the password gets nothing: no rows, no files, no app API.
  const anon = localEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const tok = await fetch(`${SUPABASE_API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: a.email, password: PASSWORD }),
  }).then((r) => r.json());
  expect(tok.access_token).toBeTruthy();
  const auth = { apikey: anon, Authorization: `Bearer ${tok.access_token}` };
  const rows = await fetch(`${SUPABASE_API}/rest/v1/products?select=id`, { headers: auth }).then((r) => r.json());
  expect(rows).toEqual([]);
  const files = await fetch(`${SUPABASE_API}/storage/v1/object/list/receipts`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: a.ws }),
  }).then((r) => r.json());
  expect(Array.isArray(files) ? files.length : 0).toBe(0);
  const api = await fetch(`${APP}/api/receipts/read`, { method: 'POST', headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' }, body: '{}' });
  expect(api.status).toBeGreaterThanOrEqual(400);

  // Signing in again asks for the code, then everything loads.
  await page.getByRole('button', { name: /Sign out/ }).first().click();
  await page.getByPlaceholder('you@company.com').fill(a.email);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByPlaceholder('000000').fill(await totp(secret));
  await page.getByRole('button', { name: /Verify|Continue|Sign in/ }).first().click();
  await page.getByText("Yirael's Workspace").first().waitFor({ timeout: 20000 });
  await nav(page, 'Products');
  await expect(page.getByText('Secret App').first()).toBeVisible();

  // Turning it off needs the code too (once the sign-in above is more than 5 minutes old).
  await nav(page, 'Workspace Settings');
  await ageLastConfirmation(page);
  await page.getByRole('button', { name: 'Turn off two-factor login' }).click();
  await confirmIt(page, { totpSecret: secret });
  await expect(page.getByText('Two-factor login is off.')).toBeVisible();
  await expect.poll(() => sql(`select count(*) from auth.mfa_factors where user_id=${q(a.uid)}`)).toBe('0');
  // Expected while 2FA is on: the app's own sign-in check before the code is entered.
  expect(s.errors.take().filter((e) => !/factors|aal|mfa/i.test(e))).toEqual([]);
  await s.ctx.close();
});
