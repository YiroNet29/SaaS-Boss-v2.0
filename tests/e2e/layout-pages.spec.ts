import { test, expect, type Page } from '@playwright/test';
import { newSession, signUp, sql, q, type Session, type Account } from './helpers';

// The Timeline and Portfolio layouts have their own version of every page. Their main actions work the
// same as Classic's: forms open, a date can be marked done, the workspace can be renamed and saved.
test.describe.configure({ mode: 'serial' });

let s: Session;
let a: Account;
const count = (table: string, where = '') => Number(sql(`select count(*) from ${table} where workspace_id=${q(a.ws)} ${where}`));

test.beforeAll(async ({ browser }) => {
  s = await newSession(browser);
  a = await signUp(s.page, 'layoutpages');
  await s.page.getByRole('button', { name: /Import Demo Stacks into Live/ }).click();
  await expect.poll(() => count('service_links')).toBeGreaterThan(10);
});
test.afterAll(async () => {
  await s?.page.evaluate(() => localStorage.setItem('stacktrack_layout', 'classic')).catch(() => {});
  await s?.ctx.close();
});
test.afterEach(() => { expect(s.errors.take(), 'errors in the page').toEqual([]); });

const useLayout = async (page: Page, layout: string) => {
  await page.evaluate((l) => localStorage.setItem('stacktrack_layout', l), layout);
  await page.reload({ waitUntil: 'networkidle' });
};
const go = (page: Page, name: RegExp) => page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name }).click();
/** Opens a dialog, checks its heading, and closes it with Escape. */
const opensAndCloses = async (page: Page, open: () => Promise<void>, heading: string) => {
  await open();
  await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: heading })).toHaveCount(0);
};

for (const layout of ['timeline', 'portfolio']) {
  test(`${layout}: every page's main actions work`, async () => {
    test.setTimeout(180_000);
    const { page } = s;
    await useLayout(page, layout);
    const main = page.getByRole('main');

    // Apps: open an app's page, its edit form, and go back
    await go(page, /^Apps$/);
    await main.getByRole('button', { name: 'PharmaFlow SaaS', exact: true }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'PharmaFlow SaaS' })).toBeVisible();
    await opensAndCloses(page, () => main.getByRole('button', { name: 'Edit', exact: true }).first().click(), 'Edit App');
    await main.getByRole('button', { name: 'All apps' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'PharmaFlow SaaS' })).toHaveCount(0);

    // Services: add and edit forms, and selecting a row for bulk edit
    await go(page, /^Services$/);
    await opensAndCloses(page, () => main.getByRole('button', { name: 'Add Service', exact: true }).click(), 'Add a service');
    await opensAndCloses(page, () => main.getByTitle('Edit service details').first().click(), 'Edit Service');
    await main.getByRole('checkbox').first().check();
    await expect(main.getByRole('button', { name: /Bulk Edit \(1\)/ })).toBeVisible();
    await main.getByRole('checkbox').first().uncheck();

    // Dates: Done marks a date done
    await go(page, /^Dates/);
    const doneBefore = count('important_dates', `and status='done'`);
    await main.getByTitle('Mark Done (Auto-generates next date if recurring)').first().click();
    await expect.poll(() => count('important_dates', `and status='done'`)).toBe(doneBefore + 1);

    // Cards & payments: the payment form opens
    await go(page, /^Cards & payments$/);
    await opensAndCloses(page, () => main.getByRole('button', { name: 'Record payment', exact: true }).click(), 'Record a payment');

    // Receipts: the paste panel opens
    await go(page, /^Receipts/);
    await main.getByRole('button', { name: 'Paste email text' }).click();
    await expect(main.getByRole('textbox').first()).toBeVisible();

    // Settings: rename the workspace and save
    await go(page, /^Settings$/);
    const name = `QA ${layout} workspace`;
    await main.getByLabel('Workspace Name').fill(name);
    await page.getByRole('button', { name: 'Save Workspace Settings' }).first().click();
    await expect.poll(() => sql(`select name from workspaces where id=${q(a.ws)}`)).toBe(name);
  });
}

test('the theme menu switches the layout, and every layout filters the apps by tag', async () => {
  test.setTimeout(120_000);
  const { page } = s;
  await useLayout(page, 'classic');
  const shown = (name: string) => page.getByRole('main').getByText(name, { exact: true }).filter({ visible: true });

  for (const [layout, apps] of [
    ['Timeline', /^Apps$/],
    ['Portfolio', /^Apps$/],
    ['Classic', /^Products/],
  ] as const) {
    await page.locator('[title^="Theme and layout:"]').filter({ visible: true }).first().click();
    await page.getByRole('group', { name: 'Layout' }).getByRole('button', { name: new RegExp(`^${layout}`) }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('stacktrack_layout'))).toBe(layout.toLowerCase());
    await expect(page.locator(`[title^="Theme and layout:"][title*=", ${layout}."]`).filter({ visible: true }).first()).toBeVisible();

    // The demo apps each have their own tags: #telegram is only on QuickBite POS.
    if (layout === 'Classic') await page.getByRole('button', { name: apps }).filter({ visible: true }).first().click();
    else await go(page, apps);
    const tag = page.getByRole('combobox', { name: 'Show apps by tag' });
    await expect(tag).toHaveValue('all');
    await expect(shown('PharmaFlow SaaS').first()).toBeVisible();
    await tag.selectOption('#telegram');
    await expect(shown('QuickBite POS').first()).toBeVisible();
    await expect(shown('PharmaFlow SaaS')).toHaveCount(0);
    await expect(shown('MiniMart ERP')).toHaveCount(0);
    await tag.selectOption('all');
    await expect(shown('MiniMart ERP').first()).toBeVisible();
  }
});
