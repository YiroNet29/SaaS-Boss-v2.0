import { test, expect, type Page } from '@playwright/test';
import { newSession, signUp, nav, sql, q, SERVICES, PASSWORD, type Session } from './helpers';
import { findLowContrast, findUnnamed } from './contrast';

// Every page and the main dialogs stay readable in each theme: all text at least 4.5:1 against
// what's behind it (3:1 for large text), measured in the browser. And every button, link and field has
// a name a screen reader can say.
test.describe.configure({ mode: 'serial' });

const THEMES = ['vscode', 'midnight', 'light'];
let s: Session;

test.beforeAll(async ({ browser }) => {
  s = await newSession(browser);
});
test.afterAll(async () => { await s?.ctx.close(); });
test.afterEach(() => { expect(s.errors.take(), 'errors in the page').toEqual([]); });

const useTheme = async (page: Page, theme: string) => {
  await page.evaluate((t) => localStorage.setItem('stacktrack_theme', t), theme);
  await page.reload({ waitUntil: 'networkidle' });
};

async function expectReadable(page: Page, where: string) {
  await page.waitForTimeout(300); // let fades and live data settle
  const low = await findLowContrast(page);
  const report = low.map((l) => `${l.ratio}:1 (needs ${l.needed}) ${l.color} on ${l.background} "${l.text}" at ${l.where}`);
  expect(report, `faint text on ${where}`).toEqual([]);
  expect(await findUnnamed(page), `controls without a name on ${where}`).toEqual([]);
}

test('the sign-in screen, in every theme', async () => {
  const { page } = s;
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('stacktrack_v2_is_demo_mode', 'false'));
  for (const theme of THEMES) {
    await useTheme(page, theme);
    await page.getByRole('button', { name: 'Create account' }).last().waitFor();
    await expectReadable(page, `sign-in (${theme})`);
  }
  await useTheme(page, 'vscode');
});

test('every page and the main dialogs, in every theme', async () => {
  test.setTimeout(240_000);
  const { page } = s;
  const a = await signUp(page, 'contrast');
  await page.getByRole('button', { name: /Import Demo Stacks into Live/ }).click();
  await expect.poll(() => Number(sql(`select count(*) from service_links where workspace_id=${q(a.ws)}`))).toBeGreaterThan(10);

  for (const theme of THEMES) {
    await useTheme(page, theme);
    const pages: [string, string | RegExp][] = [
      ['Dashboard', 'Dashboard'],
      ['Products', 'Products'],
      ['Services', SERVICES],
      ['Dates', 'Due Dates'],
      ['Cards & Payments', 'Cards & Payments'],
      ['Receipts', 'Receipts'],
      ['Settings', 'Workspace Settings'],
    ];
    for (const [name, label] of pages) {
      await nav(page, label);
      await expectReadable(page, `${name} (${theme})`);
    }

    await nav(page, 'Products');
    await page.locator('h3').filter({ visible: true }).first().click();
    await expectReadable(page, `an app's page (${theme})`);

    await nav(page, 'Due Dates');
    await page.getByRole('button', { name: 'Calendar', exact: true }).first().click();
    await expectReadable(page, `the calendar (${theme})`);

    await page.getByRole('button', { name: 'Add Date' }).first().click();
    await expectReadable(page, `the date form (${theme})`);
    await page.reload({ waitUntil: 'networkidle' });

    await nav(page, SERVICES);
    await page.getByTitle('Edit service details').first().click();
    await expectReadable(page, `the service form (${theme})`);
    await page.reload({ waitUntil: 'networkidle' });

    await nav(page, SERVICES);
    await page.getByRole('button', { name: 'Add Service' }).first().click();
    await expectReadable(page, `quick add (${theme})`);
    await page.reload({ waitUntil: 'networkidle' });

    await nav(page, 'Products');
    await page.getByRole('button', { name: /Add Product/ }).first().click();
    await expectReadable(page, `the app form (${theme})`);
    await page.reload({ waitUntil: 'networkidle' });

    await page.getByRole('button', { name: /^Command Palette/ }).click();
    await expectReadable(page, `the command palette (${theme})`);
    await page.reload({ waitUntil: 'networkidle' });

    // The lock screen (locked with Settings → App lock → Lock now, opened with the password).
    await nav(page, 'Workspace Settings');
    await page.getByRole('button', { name: 'Lock now' }).click();
    await page.getByRole('heading', { name: 'StackTrack is locked' }).waitFor();
    await expectReadable(page, `the lock screen (${theme})`);
    await page.getByLabel('Your password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Unlock with password' }).click();
    await page.getByRole('heading', { name: 'StackTrack is locked' }).waitFor({ state: 'detached' });
  }
});

test('phone width: the pages and the bottom menu, in every theme', async () => {
  test.setTimeout(120_000);
  const { page } = s;
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    for (const theme of THEMES) {
      await useTheme(page, theme);
      for (const name of ['Home', 'Products', 'Services', 'Dates', 'Money']) {
        await page.getByRole('navigation', { name: 'Mobile Bottom Navigation' }).getByRole('button', { name, exact: true }).click();
        await expectReadable(page, `${name} on a phone (${theme})`);
      }
    }
  } finally {
    await page.setViewportSize({ width: 1280, height: 720 });
    await useTheme(page, 'vscode');
  }
});
