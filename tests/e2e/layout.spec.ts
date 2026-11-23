import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { newSession, signUp, sql, q, nav, confirmIfAsked, admin, type Session, type Account } from './helpers';

// The dashboard's own buttons, the calendar file, and the phone layout in the light theme.
test.describe.configure({ mode: 'serial' });

let s: Session;
let a: Account;
const count = (where: string) => Number(sql(`select count(*) from important_dates where workspace_id=${q(a.ws)} ${where}`));

test.beforeAll(async ({ browser }) => {
  s = await newSession(browser);
  a = await signUp(s.page, 'layout');
  await s.page.getByRole('button', { name: /Import Demo Stacks into Live/ }).click();
  await expect.poll(() => Number(sql(`select count(*) from service_links where workspace_id=${q(a.ws)}`))).toBeGreaterThan(10);
});
test.afterAll(async () => { await s?.ctx.close(); });
test.afterEach(() => { expect(s.errors.take(), 'errors in the page').toEqual([]); });

test('dashboard: Done and Snooze on a due item', async () => {
  const { page } = s;
  await nav(page, 'Dashboard');
  const done = page.getByTitle('Mark Done (will auto-schedule next date if recurring)').first();
  await done.waitFor();
  const doneBefore = count(`and status='done'`);
  await done.click();
  await expect.poll(() => count(`and status='done'`)).toBe(doneBefore + 1);

  const snoozedBefore = count(`and status='snoozed'`);
  await page.getByTitle('Snooze 7 days').first().click();
  await expect.poll(() => count(`and status='snoozed'`)).toBe(snoozedBefore + 1);
});

test('calendar file (.ics) has every open date', async () => {
  const { page } = s;
  const { error } = await admin()
    .from('important_dates')
    .insert({ id: `ics-${Date.now()}`, workspace_id: a.ws, type: 'domain expiry', title: 'qa.io domain', due_date: '2027-01-15', recurrence: 'yearly', status: 'open', source: 'manual' });
  expect(error).toBeNull();
  await expect(page.getByText('qa.io domain').first()).toBeAttached();
  const dl = page.waitForEvent('download');
  await page.getByTitle('Download iCalendar file (.ics) for Apple/Google Calendar').first().click();
  await confirmIfAsked(page);
  const ics = readFileSync(await (await dl).path(), 'utf8');
  expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
  expect(ics).toContain('qa.io domain');
  expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBeGreaterThan(1);
});

test('phone, light theme: no page scrolls sideways', async () => {
  const { page } = s;
  await page.evaluate(() => localStorage.setItem('stacktrack_theme', 'light'));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload({ waitUntil: 'networkidle' });
  const bar = page.getByRole('navigation', { name: 'Mobile Bottom Navigation' });
  await bar.waitFor();
  const tooWide: string[] = [];
  for (const tab of ['Home', 'Products', 'Services', 'Dates', 'Money']) {
    await bar.getByRole('button', { name: tab, exact: true }).click();
    await page.waitForTimeout(400);
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
    if (o.sw > o.w + 1) tooWide.push(`${tab}: page is ${o.sw}px on a ${o.w}px screen`);
  }
  expect(tooWide).toEqual([]);
});
