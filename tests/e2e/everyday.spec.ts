import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { newSession, signUp, sql, q, nav, confirmIfAsked, isoDay, SERVICES, type Session, type Account } from './helpers';

// Products, services, dates, templates, import/export and workspaces, as one owner would use them.
test.describe.configure({ mode: 'serial' });

let s: Session;
let a: Account;
const count = (table: string, where = '') => Number(sql(`select count(*) from ${table} where workspace_id=${q(a.ws)} ${where}`));

test.beforeAll(async ({ browser }) => {
  s = await newSession(browser);
  a = await signUp(s.page, 'everyday');
});
test.afterAll(async () => { await s?.ctx.close(); });
test.afterEach(() => { expect(s.errors.take(), 'errors in the page').toEqual([]); });

test('demo stacks import into the live workspace and survive a reload', async () => {
  const { page } = s;
  await page.getByRole('button', { name: /Explore Demo/ }).first().click();
  await page.getByText('DEMO MODE ACTIVE').first().waitFor();
  await page.getByRole('button', { name: /Import to Live/ }).first().click();
  await page.getByText("Yirael's Workspace").first().waitFor({ timeout: 20000 });
  // Everything the app shows gets saved (this once lost 14 of 15 services).
  const menu = page.getByRole('button', { name: SERVICES }).first();
  await expect(menu).toHaveText(/\d{2}$/); // the imported services are listed
  const services = Number((await menu.innerText()).replace(/\D+/g, ''));
  await expect.poll(() => count('service_links')).toBe(services);
  expect(count('products')).toBeGreaterThan(2);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText("Yirael's Workspace").first().waitFor({ timeout: 20000 });
  await expect(page.getByRole('button', { name: SERVICES }).first()).toContainText(String(services));
});

test('vault references open the key only once a vault address is set', async () => {
  const { page } = s;
  // New workspaces no longer get a made-up address.
  expect(sql(`select vault_base_url from workspaces where id=${q(a.ws)}`)).toBe('');
  await nav(page, SERVICES);
  await expect(page.locator('span[title^="Vault item"]').first()).toBeVisible();
  expect(await page.locator('a[href*="/vault/api-keys/"]').count()).toBe(0);

  await nav(page, 'Workspace Settings');
  await page.getByLabel('Vault address').fill('https://vault.example.com/');
  await page.getByRole('button', { name: 'Save Workspace Settings' }).click();
  await confirmIfAsked(page);
  await expect.poll(() => sql(`select vault_base_url from workspaces where id=${q(a.ws)}`)).toBe('https://vault.example.com/');
  await nav(page, SERVICES);
  await expect(page.locator('a[href^="https://vault.example.com/vault/api-keys/"]').first()).toBeVisible();
});

test('products: create, edit, delete (its services go with it)', async () => {
  const { page } = s;
  await nav(page, 'Products');
  await page.getByRole('button', { name: /Add Product/ }).first().click();
  await page.getByPlaceholder('e.g. PharmaFlow or QuickBite POS').fill('QA App');
  await page.getByRole('button', { name: 'Create App' }).click();
  await expect.poll(() => count('products', `and name='QA App'`)).toBe(1);

  await nav(page, 'Products');
  const card = (n: string) => page.locator('div', { has: page.getByText(n, { exact: true }) }).filter({ has: page.getByTitle('Edit Product') }).last();
  await card('MiniMart ERP').getByTitle('Edit Product').click();
  await page.getByPlaceholder(/What does this SaaS do/).fill('Edited in QA');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect.poll(() => sql(`select description from products where workspace_id=${q(a.ws)} and name='MiniMart ERP'`)).toBe('Edited in QA');

  const pid = sql(`select id from products where workspace_id=${q(a.ws)} and name='MiniMart ERP'`);
  const own = count('service_links', `and product_id=${q(pid)}`);
  const before = count('service_links');
  expect(own).toBeGreaterThan(0);
  await card('MiniMart ERP').getByTitle('Delete Product').click();
  await page.getByRole('button', { name: 'Delete Product' }).last().click();
  await confirmIfAsked(page);
  await expect.poll(() => count('products', `and name='MiniMart ERP'`)).toBe(0);
  await expect.poll(() => count('service_links')).toBe(before - own);
  await expect(page.getByRole('button', { name: SERVICES }).first()).toContainText(String(before - own));
});

test('services: quick add, edit, mark paid moves the renewal on and records a payment', async () => {
  const { page } = s;
  await nav(page, 'Products');
  await page.getByText('QA App', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Add Service' }).first().click();
  await page.getByLabel('Service name *').fill('QA Railway');
  await page.getByLabel('Cost').fill('5');
  await page.getByLabel('Next renewal').fill(isoDay(3));
  await page.getByRole('button', { name: 'Save service' }).click();
  await expect.poll(() => sql(`select cost::float8 || ' ' || renewal_date from service_links where workspace_id=${q(a.ws)} and provider_name='QA Railway'`)).toBe(`5 ${isoDay(3)}`);

  await nav(page, SERVICES);
  const row = page.locator('div', { has: page.getByText('QA Railway', { exact: true }) }).filter({ has: page.getByTitle('Edit service details') }).last();
  await row.getByTitle('Edit service details').click();
  await page.getByPlaceholder('Pro, Team, PayG').fill('Hobby');
  const auto = page.getByLabel('Auto-renews automatically on billing cycle');
  if (await auto.isChecked()) await auto.uncheck();
  await page.getByRole('button', { name: /Save Service Link|Update Service|Save Changes/ }).click();
  await expect.poll(() => sql(`select plan || ' auto=' || auto_renew from service_links where workspace_id=${q(a.ws)} and provider_name='QA Railway'`)).toBe('Hobby auto=false');

  await row.getByRole('button', { name: 'Mark paid' }).click();
  await expect.poll(() => count('payments', `and service_link_id in (select id from service_links where provider_name='QA Railway')`)).toBe(1);
  // The payment is saved first, then the new renewal date (a month on).
  await expect
    .poll(() => sql(`select renewal_date > ${q(isoDay(3))}::date from service_links where workspace_id=${q(a.ws)} and provider_name='QA Railway'`))
    .toBe('t');
});

test('dates: a recurring date marked done schedules the next one; snooze; edit; delete', async () => {
  const { page } = s;
  await nav(page, 'Due Dates');
  await page.getByRole('button', { name: 'Add Date' }).first().click();
  await page.getByPlaceholder('e.g. Rotate Supabase Master Password').fill('QA rotate key');
  await page.locator('form select').nth(2).selectOption('monthly');
  await page.locator('form input[type=date]').fill(isoDay(2));
  await page.getByRole('button', { name: 'Add Due Date' }).click();
  await expect.poll(() => count('important_dates', `and title='QA rotate key'`)).toBe(1);

  const row = (t: string) => page.locator('div.p-4.rounded-2xl', { has: page.getByText(t, { exact: true }) }).first();
  await row('QA rotate key').getByRole('button', { name: 'Done' }).click();
  await expect
    .poll(() => sql(`select string_agg(status, ',' order by due_date) from important_dates where workspace_id=${q(a.ws)} and title='QA rotate key'`))
    .toBe('done,open');
  const nextDue = sql(`select due_date from important_dates where workspace_id=${q(a.ws)} and title='QA rotate key' and status='open'`);
  expect(nextDue > isoDay(2)).toBe(true);

  const snoozedBefore = count('important_dates', `and status='snoozed'`);
  await page.getByRole('button', { name: /Snooze/ }).first().click();
  await page.getByRole('button', { name: '+7 Days' }).click();
  await page.getByRole('button', { name: /Snooze for 7 Days/ }).click();
  await expect.poll(() => count('important_dates', `and status='snoozed'`)).toBe(snoozedBefore + 1);

  await row('QA rotate key').getByTitle('Edit milestone').click();
  await page.getByPlaceholder('e.g. Rotate Supabase Master Password').fill('QA rotate key (edited)');
  await page.getByRole('button', { name: 'Save Milestone' }).click();
  await expect.poll(() => count('important_dates', `and title='QA rotate key (edited)'`)).toBe(1);
  await row('QA rotate key (edited)').getByTitle('Delete milestone').click();
  await page.getByRole('button', { name: 'Delete Date' }).click();
  await confirmIfAsked(page);
  await expect.poll(() => count('important_dates', `and title='QA rotate key (edited)'`)).toBe(0);
});

test('templates: stamp out a stack, then clone the product', async () => {
  const { page } = s;
  await nav(page, 'Products');
  await page.getByRole('button', { name: /Use Template/ }).first().click();
  await page.getByPlaceholder('e.g. PharmacyManager or MiniMarket POS').fill('QA Template App');
  await page.getByRole('button', { name: /Stamp Out Stack/ }).click();
  const servicesOf = (name: string) =>
    Number(sql(`select count(*) from service_links s join products p on p.id=s.product_id where p.workspace_id=${q(a.ws)} and p.name=${q(name)}`));
  await expect.poll(() => servicesOf('QA Template App')).toBeGreaterThan(0);

  await nav(page, 'Products');
  const row = page.locator('div', { has: page.getByText('QA Template App', { exact: true }) }).filter({ has: page.getByTitle('Clone Product') }).last();
  await row.getByTitle('Clone Product').click();
  await page.getByPlaceholder('Copy of QA Template App').fill('QA Clone');
  await page.getByRole('button', { name: 'Clone Product' }).last().click();
  await expect.poll(() => servicesOf('QA Clone')).toBe(servicesOf('QA Template App'));
});

test('services: duplicate to another product, bulk edit, delete', async () => {
  const { page } = s;
  await nav(page, SERVICES);
  const row = page.locator('div', { has: page.getByText('QA Railway', { exact: true }) }).filter({ has: page.getByTitle('Duplicate across multiple products') }).last();
  await row.getByTitle('Duplicate across multiple products').click();
  await page.getByText('QA Clone', { exact: true }).last().click();
  await page.getByRole('button', { name: /^Duplicate to/ }).click();
  await expect.poll(() => count('service_links', `and provider_name='QA Railway'`)).toBe(2);

  await page.getByText(/Select All/).first().click();
  await page.getByRole('button', { name: /Bulk Edit/ }).click();
  const dlg = page.locator('div.fixed').filter({ hasText: 'Update Status' }).last();
  await dlg.getByText('Update Status').click();
  await dlg.locator('select').last().selectOption('paused');
  await page.getByRole('button', { name: 'Apply Bulk Edit' }).click();
  await expect.poll(() => count('service_links', `and status<>'paused'`)).toBe(0);

  const before = count('service_links');
  const target = page.locator('div', { has: page.getByText('QA Railway', { exact: true }) }).filter({ has: page.getByTitle('Delete service link') }).last();
  await target.getByTitle('Delete service link').click();
  await page.getByRole('button', { name: /^Delete/ }).last().click();
  await confirmIfAsked(page);
  await expect.poll(() => count('service_links')).toBe(before - 1);
});

test('import and export: CSV and JSON downloads, CSV import adds a product and service', async () => {
  const { page } = s;
  await nav(page, 'Import & Export');
  const modal = page.locator('div.fixed', { hasText: 'Import & Export Stack Data' }).last();
  const csvDl = page.waitForEvent('download');
  await modal.getByRole('button', { name: 'Export CSV' }).click();
  const csv = readFileSync(await (await csvDl).path(), 'utf8');
  expect(csv.split('\n')[0]).toContain('ProductName');
  expect(csv).toContain('QA Railway');
  expect(csv).not.toContain(',Default,'); // the old "Paid with Default" bug

  const jsonDl = page.waitForEvent('download');
  await modal.getByRole('button', { name: 'Export JSON' }).click();
  const json = JSON.parse(readFileSync(await (await jsonDl).path(), 'utf8'));
  expect(JSON.stringify(json)).toContain('QA Template App');

  await modal.getByRole('button', { name: /^Import CSV/ }).click();
  const sample =
    'ProductName,Environment,Category,Provider,Plan,BillingCycle,Cost,Currency,RenewalDate,AutoRenew,PaymentMethod,AccountEmail,Notes\n' +
    `CSV App,production,hosting,Fly.io,Hobby,monthly,7,USD,${isoDay(20)},true,,ops@x.io,from CSV\n`;
  await modal.locator('input[type=file]').setInputFiles({ name: 'import.csv', mimeType: 'text/csv', buffer: Buffer.from(sample) });
  await modal.getByRole('button', { name: /Confirm & Import 1 Services/ }).click();
  await expect.poll(() => count('service_links', `and provider_name='Fly.io' and cost=7`)).toBe(1);
  expect(count('products', `and name='CSV App'`)).toBe(1);
  if (await modal.isVisible()) await modal.getByRole('button', { name: 'Close' }).last().click();
});

test('command palette finds a service by name', async () => {
  const { page } = s;
  await page.keyboard.press('Control+k');
  const input = page.getByPlaceholder(/Type a command, product, service/);
  await input.fill('Fly.io');
  await expect(page.getByText('Fly.io').last()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(input).toBeHidden();
});

test('workspaces: create a second one with the setup wizard, then switch back', async () => {
  const { page } = s;
  await page.getByRole('button', { name: 'Switch Workspace' }).click();
  await page.getByRole('button', { name: /Create Workspace/ }).click();
  await page.getByLabel('Name').fill('QA Second');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: /Complete Setup/ }).click();
  await expect(page.getByRole('button', { name: 'Switch Workspace' })).toContainText('QA Second');
  await expect.poll(() => sql(`select count(*) from workspaces where owner_id=${q(a.uid)}`)).toBe('2');

  await page.getByRole('button', { name: 'Switch Workspace' }).click();
  await page.locator('button', { hasText: "Yirael's Workspace" }).last().click();
  await expect(page.getByRole('button', { name: 'Switch Workspace' })).toContainText("Yirael's Workspace");
  await page.reload({ waitUntil: 'networkidle' });
  await nav(page, SERVICES);
  await expect(page.getByText('Fly.io', { exact: true }).filter({ visible: true }).first()).toBeVisible();
});
