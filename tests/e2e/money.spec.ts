import { test, expect } from '@playwright/test';
import { newSession, signUp, sql, q, nav, confirmIfAsked, isoDay, type Session, type Account } from './helpers';

// Cards & Payments: cards, a person who pays for you, balances, payments, corrections.
test.describe.configure({ mode: 'serial' });

let s: Session;
let a: Account;
const count = (table: string, where = '') => Number(sql(`select count(*) from ${table} where workspace_id=${q(a.ws)} ${where}`));
const sourceId = (name: string) => sql(`select id from payment_sources where workspace_id=${q(a.ws)} and name=${q(name)}`);

test.beforeAll(async ({ browser }) => {
  s = await newSession(browser);
  a = await signUp(s.page, 'money');
  await nav(s.page, 'Cards & Payments');
});
test.afterAll(async () => { await s?.ctx.close(); });
test.afterEach(() => { expect(s.errors.take(), 'errors in the page').toEqual([]); });

const card = (name: string) => s.page.locator('article', { has: s.page.getByRole('heading', { name, exact: true }) });
const balance = (name: string) => card(name).locator('p.font-mono').first();
/** "$40" or "$40.00". */
const usd = (n: number) => new RegExp(`^\\$${n}(\\.00)?$`);

test('card: add, rename, top up, delete a mistaken top-up, correct the balance', async () => {
  const { page } = s;
  await page.getByRole('button', { name: 'Add card or person' }).first().click();
  await page.getByLabel('Name *').fill('Grey');
  await page.getByLabel('Last 4 digits').fill('4821');
  await page.getByLabel('Expires (month)').fill(isoDay(60).slice(0, 7));
  await page.getByLabel('Balance now (USD)').fill('40');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect.poll(() => sql(`select last4 || ' ' || opening_balance::float8 from payment_sources where workspace_id=${q(a.ws)} and name='Grey'`)).toBe('4821 40');
  await expect(balance('Grey')).toHaveText(usd(40));

  await page.getByRole('button', { name: 'Edit Grey' }).click();
  await page.getByLabel('Name *').fill('Grey USD');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => count('payment_sources', `and name='Grey USD'`)).toBe(1);

  await card('Grey USD').getByRole('button', { name: 'Top up' }).click();
  await page.getByLabel('Amount (USD)').fill('500');
  await page.getByRole('button', { name: 'Save top-up' }).click();
  await expect(balance('Grey USD')).toHaveText(usd(540));
  await expect.poll(() => count('source_transactions', `and kind='top_up'`)).toBe(1);

  await card('Grey USD').getByRole('button', { name: /Delete top-up of 500/ }).click();
  await expect(balance('Grey USD')).toHaveText(usd(40));
  await expect.poll(() => count('source_transactions', `and kind='top_up'`)).toBe(0);

  await card('Grey USD').getByRole('button', { name: 'Correct balance' }).click();
  await page.locator('form input[type=number]').first().fill('35');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(balance('Grey USD')).toHaveText(usd(35));
});

test('a payment lowers the card balance; its birr cost is saved; deleting it restores the balance', async () => {
  const { page } = s;
  await page.getByRole('button', { name: 'Record payment' }).first().click();
  await page.getByLabel('Amount').first().fill('9');
  await page.getByLabel('Paid with').selectOption({ label: 'Grey USD' });
  await page.getByRole('button', { name: 'Save payment' }).click();
  await expect.poll(() => count('payments', `and source_id=${q(sourceId('Grey USD'))}`)).toBe(1);
  await expect(balance('Grey USD')).toHaveText(usd(26));

  const birr = page.getByLabel(new RegExp(`Cost in birr for .* on ${isoDay()}`)).first();
  await birr.fill('1450');
  await birr.blur();
  await expect.poll(() => count('payments', `and etb_paid=1450`)).toBe(1);

  await page.getByRole('button', { name: new RegExp(`^Delete payment for .* on ${isoDay()}`) }).first().click();
  await expect.poll(() => count('payments')).toBe(0);
  await expect(balance('Grey USD')).toHaveText(usd(35));
  await expect
    .poll(() => count('audit_logs', `and details ilike 'Deleted payment of %'`))
    .toBe(1);
});

test('a person: what they paid for you, settling up, removing them keeps the history', async () => {
  const { page } = s;
  await page.getByRole('button', { name: 'Add card or person' }).first().click();
  await page.getByRole('group').getByRole('button', { name: 'Person' }).click();
  await page.getByLabel('Name *').fill('Abebe (USA)');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect.poll(() => sql(`select kind from payment_sources where workspace_id=${q(a.ws)} and name='Abebe (USA)'`)).toBe('person');

  await page.getByRole('button', { name: 'Record payment' }).first().click();
  await page.getByLabel('Amount').first().fill('12');
  await page.getByLabel('Paid with').selectOption({ label: 'Abebe (USA)' });
  await page.getByRole('button', { name: 'Save payment' }).click();
  await expect.poll(() => count('payments', `and source_id=${q(sourceId('Abebe (USA)'))}`)).toBe(1);

  await card('Abebe (USA)').getByRole('button', { name: 'Settle up' }).click();
  await page.getByRole('button', { name: 'Save repayment' }).click();
  await expect.poll(() => count('source_transactions', `and kind='repayment'`)).toBe(1);

  await card('Abebe (USA)').getByRole('button', { name: 'Delete Abebe (USA)' }).click();
  await confirmIfAsked(page);
  await expect.poll(() => count('payment_sources', `and name='Abebe (USA)'`)).toBe(0);
  expect(count('payments', `and amount=12`)).toBe(1);
});
