import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { APP, DB_CONTAINER, MAILPIT } from './ports';

export const PASSWORD = 'a-long-local-password';

let envCache: Record<string, string> | null = null;
/** The local stack's keys, as written by `npm run local:env`. */
export function localEnv(): Record<string, string> {
  if (!envCache) {
    envCache = Object.fromEntries(
      readFileSync('.env.development.local', 'utf8')
        .split('\n')
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
    );
  }
  return envCache;
}

/** Runs one SQL statement on the local database as postgres and returns the trimmed text output. */
export function sql(query: string): string {
  return execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-tAc', query], { encoding: 'utf8' }).trim();
}
/** Quotes a value for SQL. */
export const q = (v: string) => `'${v.replace(/'/g, "''")}'`;

let adminClient: SupabaseClient | null = null;
/** A service-role client for setting up data the way the bot or the hourly job would. */
export function admin(): SupabaseClient {
  if (!adminClient) {
    const env = localEnv();
    adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }
  return adminClient;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const isoDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400e3).toLocaleDateString('en-CA');

// ---- Two-factor codes ----
function base32(s: string): Buffer {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) bits += a.indexOf(c).toString(2).padStart(5, '0');
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totpAt(secret: string, step: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', base32(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
const usedSteps = new Map<string, number>();
/** A code from the authenticator app. Waits for a fresh 30-second window if this one's code was already used. */
export async function totp(secret: string): Promise<string> {
  let step = Math.floor(Date.now() / 30000);
  if (usedSteps.get(secret) === step) {
    await sleep((step + 1) * 30000 - Date.now() + 500);
    step = Math.floor(Date.now() / 30000);
  }
  usedSteps.set(secret, step);
  return totpAt(secret, step);
}

// ---- Watching for errors ----
export interface ErrorWatch {
  /** Returns and clears what was collected. */
  take(): string[];
  /** Ignore matching errors from now on (for ones a test causes on purpose). */
  allow(pattern: RegExp): void;
}
/** Collects page errors, console errors and failed calls to Supabase or the app's API. */
export function watchErrors(page: Page, tag = ''): ErrorWatch {
  const list: string[] = [];
  const allowed: RegExp[] = [/DevTools/, /favicon/];
  const add = (s: string) => {
    if (!allowed.some((r) => r.test(s))) list.push((tag ? `${tag} ` : '') + s.slice(0, 300));
  };
  page.on('pageerror', (e) => add('page error: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') add('console: ' + m.text());
  });
  page.on('response', async (r) => {
    const u = r.url();
    if ((u.includes(':55621/') || u.startsWith(APP + '/api/')) && r.status() >= 400) {
      let body = '';
      try { body = (await r.text()).slice(0, 200); } catch { /* page closed */ }
      add(`HTTP ${r.status()} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '')} ${body}`);
    }
  });
  return { take: () => list.splice(0), allow: (p) => { allowed.push(p); } };
}

// ---- Pages and accounts ----
export interface Session {
  ctx: BrowserContext;
  page: Page;
  errors: ErrorWatch;
}
/** A fresh browser context with the exchange-rate API stubbed (no outside network in tests). */
export async function newSession(browser: Browser, opts: { viewport?: { width: number; height: number } } = {}): Promise<Session> {
  const ctx = await browser.newContext({ baseURL: APP, viewport: opts.viewport ?? { width: 1280, height: 1000 }, acceptDownloads: true });
  await ctx.route('**/api/fx/**', (r) => r.fulfill({ json: { rate: 157.42, source: 'test', asOf: new Date().toISOString() } }));
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  return { ctx, page, errors: watchErrors(page) };
}

export interface Account {
  email: string;
  password: string;
  uid: string;
  ws: string;
}
let counter = 0;
export const uniqueEmail = (tag: string) => `e2e-${tag}-${Date.now()}-${++counter}@stacktrack.local`;

/** Opens the app in live mode and creates a new account; waits for its first workspace. */
export async function signUp(page: Page, tag: string, name = 'Yirael'): Promise<Account> {
  const email = uniqueEmail(tag);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('stacktrack_v2_is_demo_mode', 'false'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Create account' }).last().click();
  await page.getByPlaceholder('Your name').fill(name);
  await page.getByPlaceholder('you@company.com').fill(email);
  await page.getByPlaceholder('Password (8+ characters)').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Create account' }).click();
  await page.getByText(`${name}'s Workspace`).first().waitFor({ timeout: 30000 });
  const uid = sql(`select id from auth.users where email=${q(email)}`);
  await expect.poll(() => sql(`select count(*) from workspaces where owner_id=${q(uid)}`)).toBe('1');
  const ws = sql(`select id from workspaces where owner_id=${q(uid)}`);
  return { email, password: PASSWORD, uid, ws };
}

/** The Services menu item. */
export const SERVICES = /^Services\b/;
/** Clicks a sidebar item by the start of its name ("Products", "Cards & Payments", …). */
export const nav = (page: Page, name: string | RegExp) =>
  page
    .getByRole('button', { name: typeof name === 'string' ? new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : name })
    .first()
    .click();

/**
 * Risky actions skip "Confirm it's you" for 5 minutes after a sign-in, 2FA code or unlock.
 * This makes that last check look 6 minutes old, so the next risky action asks again.
 */
export const ageLastConfirmation = (page: Page) =>
  page.evaluate(() => sessionStorage.setItem('stacktrack_verified_at', String(Date.now() - 6 * 60_000)));

/** Answers the "Confirm it's you" dialog if it is open (password, or a 2FA code when 2FA is on). */
export async function confirmIfAsked(page: Page, opts: { password?: string; totpSecret?: string } = {}) {
  const dlg = page.getByRole('dialog', { name: "Confirm it's you" });
  if (!(await dlg.isVisible().catch(() => false))) return false;
  await confirmIt(page, opts);
  return true;
}
/** Answers the "Confirm it's you" dialog, waiting for it to open. */
export async function confirmIt(page: Page, opts: { password?: string; totpSecret?: string } = {}) {
  const dlg = page.getByRole('dialog', { name: "Confirm it's you" });
  await dlg.waitFor({ timeout: 10000 });
  const code = dlg.getByPlaceholder(/2FA code|000000/);
  if (opts.totpSecret && (await code.count())) {
    await code.fill(await totp(opts.totpSecret));
    await dlg.getByRole('button', { name: 'Unlock with code' }).click();
  } else {
    await dlg.getByLabel('Your password').fill(opts.password ?? PASSWORD);
    await dlg.getByRole('button', { name: 'Unlock with password' }).click();
  }
  await dlg.waitFor({ state: 'detached', timeout: 10000 });
}

/** The newest email Mailpit received for an address. */
export async function latestEmail(to: string): Promise<{ Subject: string; Text: string }> {
  let id: string | undefined;
  await expect
    .poll(async () => {
      const list = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + to)}`).then((r) => r.json());
      id = list.messages?.[0]?.ID;
      return Boolean(id);
    }, { message: `an email to ${to} in Mailpit` })
    .toBe(true);
  return fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json());
}

/** Adds a virtual fingerprint reader to the page (passkeys). */
export async function addVirtualAuthenticator(ctx: BrowserContext, page: Page) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
}
