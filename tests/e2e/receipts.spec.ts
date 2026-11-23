import { test, expect } from '@playwright/test';
import { newSession, signUp, sql, q, nav, confirmIfAsked, admin, type Session, type Account } from './helpers';

// Receipts without the Claude key (tests never call the real API): the simple text reader,
// private file storage with a preview, and typing the details yourself.
test.describe.configure({ mode: 'serial' });

let s: Session;
let a: Account;
const count = (table: string, where = '') => Number(sql(`select count(*) from ${table} where workspace_id=${q(a.ws)} ${where}`));
const files = () => Number(sql(`select count(*) from storage.objects where bucket_id='receipts' and name like ${q(a.ws + '/%')}`));

test.beforeAll(async ({ browser }) => {
  s = await newSession(browser);
  a = await signUp(s.page, 'receipts');
  const { error } = await admin()
    .from('payment_sources')
    .insert({ id: `src-${a.ws}`, workspace_id: a.ws, name: 'Grey', kind: 'card', currency: 'USD', prepaid: true, opening_balance: 100, last4: '4821' });
  expect(error).toBeNull();
  await s.page.reload({ waitUntil: 'networkidle' });
  await nav(s.page, 'Receipts');
});
test.afterAll(async () => { await s?.ctx.close(); });
test.afterEach(() => { expect(s.errors.take(), 'errors in the page').toEqual([]); });

test('pasted email text: vendor, amount, date and card are found; confirming records the payment', async () => {
  const { page } = s;
  await page.getByRole('button', { name: 'Paste email text' }).click();
  await page.getByLabel('Receipt or payment email text').fill('From: Vercel Billing <billing@vercel.com>\nAmount paid $20.00 on Nov 5, 2026\nVisa ending in 4821');
  await page.getByRole('button', { name: 'Read text' }).click();
  const r = page.locator('article', { has: page.locator('input[value="Vercel"]') });
  await r.waitFor({ timeout: 20000 });
  await expect(r.getByLabel('Amount')).toHaveValue(/^20(\.00?)?$/);
  await expect(r.getByLabel('Date paid')).toHaveValue('2026-11-05');
  expect(await r.getByLabel('Paid with').evaluate((el: HTMLSelectElement) => el.options[el.selectedIndex].text)).toContain('Grey');

  await r.getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(() => count('receipts', `and status='confirmed'`)).toBe(1);
  await expect
    .poll(() => sql(`select amount::float8 || ' ' || paid_on || ' ' || (receipt_id is not null) from payments where workspace_id=${q(a.ws)} and source_id=${q('src-' + a.ws)}`))
    .toBe('20 2026-11-05 true');
});

test('photo: stored privately, the preview loads, confirming with typed details records the payment', async () => {
  const { page, ctx } = s;
  const shot = await ctx.newPage();
  await shot.setViewportSize({ width: 300, height: 200 });
  await shot.setContent('<div style="font:16px monospace;padding:16px;background:#fff">FIGMA<br>Total $15.00<br>Nov 7, 2026</div>');
  const png = await shot.screenshot();
  await shot.close();

  await page.locator('input[type=file][aria-label="Receipt file"]').setInputFiles({ name: 'figma.png', mimeType: 'image/png', buffer: png });
  const card = page.locator('article', { has: page.getByText(/Automatic reading is off/) }).first();
  await card.waitFor({ timeout: 30000 });
  await expect.poll(() => files()).toBe(1);
  expect(sql(`select metadata->>'mimetype' from storage.objects where bucket_id='receipts' and name like ${q(a.ws + '/%')}`)).toBe('image/png');
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('article img[alt="Receipt"]')].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 });

  await card.getByLabel('Vendor').fill('Figma');
  await card.getByLabel('Amount').fill('15');
  await card.getByLabel('Paid with').selectOption({ label: 'Grey •••• 4821' });
  await card.getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(() => count('payments', `and amount=15 and receipt_id is not null`)).toBe(1);
  await expect.poll(() => count('receipts', `and status='confirmed'`)).toBe(2);
});

test('PDF: typed details are kept; deleting its payment sends it back to review; deleting it removes the file', async () => {
  const { page } = s;
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
  await page.locator('input[type=file][aria-label="Receipt file"]').setInputFiles({ name: 'hetzner-invoice.pdf', mimeType: 'application/pdf', buffer: pdf });
  const r = page.locator('article', { has: page.getByText('hetzner-invoice.pdf') });
  await r.getByLabel('Vendor').waitFor({ timeout: 20000 });
  await r.getByLabel('Vendor').fill('Hetzner');
  await r.getByLabel('Amount').fill('6.5');
  // The read finishing, or a live update arriving, must not wipe what was typed.
  await expect.poll(() => count('receipts', `and status='needs_review'`)).toBe(1);
  await page.waitForTimeout(2000);
  await expect(r.getByLabel('Vendor')).toHaveValue('Hetzner');
  await expect(r.getByLabel('Amount')).toHaveValue('6.5');

  await r.getByRole('button', { name: 'Confirm' }).click();
  const rid = sql(`select id from receipts where workspace_id=${q(a.ws)} and original_name='hetzner-invoice.pdf'`);
  await expect.poll(() => sql(`select status from receipts where id=${q(rid)}`)).toBe('confirmed');
  expect(files()).toBe(2);

  await nav(page, 'Cards & Payments');
  const pid = sql(`select payment_id from receipts where id=${q(rid)}`);
  const paidOn = sql(`select paid_on from payments where id=${q(pid)}`);
  await page
    .locator('tr', { has: page.getByRole('cell', { name: '$6.50', exact: true }) })
    .getByRole('button', { name: new RegExp(`^Delete payment for .* on ${paidOn}`) })
    .click();
  await expect.poll(() => count('payments', `and id=${q(pid)}`)).toBe(0);
  await expect.poll(() => sql(`select status || ' ' || coalesce(payment_id, 'none') from receipts where id=${q(rid)}`)).toBe('needs_review none');

  await nav(page, 'Receipts');
  await page.locator('article', { has: page.getByText('hetzner-invoice.pdf') }).getByRole('button', { name: 'Delete receipt' }).click();
  await confirmIfAsked(page);
  await expect.poll(() => count('receipts', `and id=${q(rid)}`)).toBe(0);
  await expect.poll(() => files()).toBe(1);
});
