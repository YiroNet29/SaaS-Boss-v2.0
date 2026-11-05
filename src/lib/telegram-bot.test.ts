/**
 * End-to-end tests for the Telegram bot and Telegram-first delivery, using an in-memory stand-in
 * for the Supabase query builder and a recording fake for the Telegram API.
 * Run with: tsx --conditions=react-server --test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTelegramUpdate, type TgCall } from './telegram-bot';
import { deliverReminders, type SettingsRow } from './reminders-server';
import type { DueAlert } from '../utils/reminderDigest';

// ---------- tiny in-memory Supabase ----------
type Row = Record<string, any>;
class Query {
  private filters: ((r: Row) => boolean)[] = [];
  private mode: 'select' | 'update' = 'select';
  private patch: Row | null = null;
  private returnRows = false;
  private one: 'maybe' | 'single' | null = null;
  constructor(private db: Record<string, Row[]>, private table: string) {}
  select() {
    if (this.mode === 'update') this.returnRows = true;
    return this;
  }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  lt(c: string, v: any) { this.filters.push((r) => r[c] != null && r[c] < v); return this; }
  order() { return this; }
  limit() { return this; }
  update(patch: Row) { this.mode = 'update'; this.patch = patch; return this; }
  insert(rows: Row | Row[]) {
    (this.db[this.table] ??= []).push(...(Array.isArray(rows) ? rows : [rows]).map((r) => ({ ...r })));
    return Promise.resolve({ data: null, error: null });
  }
  maybeSingle() { this.one = 'maybe'; return this.run(); }
  single() { this.one = 'single'; return this.run(); }
  then(res: any, rej: any) { return this.run().then(res, rej); }
  private run() {
    const matched = (this.db[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)));
    if (this.mode === 'update') matched.forEach((r) => Object.assign(r, this.patch));
    let data: any = this.mode === 'update' && !this.returnRows ? null : matched.map((r) => ({ ...r }));
    if (this.one) data = data?.[0] ?? null;
    return Promise.resolve({ data, error: null });
  }
}
const fakeAdmin = (db: Record<string, Row[]>) => ({ from: (t: string) => new Query(db, t) }) as any;

function fakeTg() {
  const calls: { method: string; payload: Record<string, any> }[] = [];
  const tg: TgCall = async (method, payload) => {
    calls.push({ method, payload });
    return {} as any;
  };
  return { tg, calls };
}

function seed(): Record<string, Row[]> {
  return {
    workspaces: [
      { id: 'ws-1', name: 'Yiro Studio', timezone: 'Africa/Addis_Ababa', exchange_rates: { ETB_per_USD: 150 }, default_lead_days: [30, 14, 7, 1] },
      { id: 'ws-2', name: 'Someone else', timezone: 'UTC', exchange_rates: { ETB_per_USD: 150 }, default_lead_days: [7] },
    ],
    notification_settings: [
      { workspace_id: 'ws-1', telegram_chat_id: '', telegram_enabled: false, telegram_verification_code: 'ST-ABC' },
      { workspace_id: 'ws-2', telegram_chat_id: '999', telegram_enabled: true, telegram_verification_code: 'ST-ZZZ' },
    ],
    products: [{ id: 'p-1', workspace_id: 'ws-1', name: 'SaaS Boss' }],
    important_dates: [
      { id: 'd-rec', workspace_id: 'ws-1', product_id: 'p-1', title: 'saasboss.io domain', type: 'domain expiry', due_date: '2026-11-12', recurrence: 'yearly', status: 'open', snoozed_until: null, source: 'manual' },
      { id: 'd-over', workspace_id: 'ws-1', product_id: 'p-1', title: 'Rotate Stripe key', type: 'key rotation', due_date: '2026-10-21', recurrence: 'none', status: 'open', snoozed_until: null, source: 'manual' },
      { id: 'd-other', workspace_id: 'ws-2', title: 'Not yours', type: 'custom', due_date: '2026-11-10', recurrence: 'none', status: 'open', snoozed_until: null },
    ],
    service_links: [
      { id: 's-manual', workspace_id: 'ws-1', product_id: 'p-1', provider_name: 'Namecheap', plan: '', billing_cycle: 'monthly', cost: 3900, currency: 'ETB', renewal_date: '2026-11-07', auto_renew: false, status: 'active' },
      { id: 's-auto', workspace_id: 'ws-1', product_id: 'p-1', provider_name: 'Vercel', plan: 'Pro', billing_cycle: 'monthly', cost: 20, currency: 'USD', renewal_date: '2026-11-12', auto_renew: true, status: 'active' },
    ],
    audit_logs: [],
  };
}

const NOW = new Date('2026-11-05T09:00:00Z'); // 12:00 in Addis Ababa
const msg = (chatId: number, text: string, type = 'private') => ({ message: { text, chat: { id: chatId, type } } });
const tap = (chatId: number, data: string, reply_markup?: any) => ({
  callback_query: { id: 'cb1', data, message: { message_id: 42, chat: { id: chatId, type: 'private' }, reply_markup } },
});
const answers = (calls: { method: string; payload: any }[]) => calls.filter((c) => c.method === 'answerCallbackQuery');

test('bot: linking, /due with buttons, and every button action with its safety checks', async () => {
  const db = seed();
  const { tg, calls } = fakeTg();
  const deps = { admin: fakeAdmin(db), tg, now: NOW, appUrl: 'https://saas-boss-v20.vercel.app' };
  const run = (u: any) => handleTelegramUpdate(u, deps);

  // Group chats are ignored entirely.
  await run(msg(-100, '/due', 'group'));
  assert.equal(calls.length, 0);

  // Not linked yet.
  await run(msg(111, '/due'));
  assert.match(calls.at(-1)!.payload.text, /not linked yet/);

  // Wrong then right link code.
  await run(msg(111, '/start WRONG'));
  assert.match(calls.at(-1)!.payload.text, /not recognised/);
  await run(msg(111, '/start ST-ABC'));
  assert.match(calls.at(-1)!.payload.text, /Connected to StackTrack/);
  assert.equal(db.notification_settings[0].telegram_chat_id, '111');
  assert.equal(db.notification_settings[0].telegram_enabled, true);
  assert.equal(db.notification_settings[0].telegram_verification_code, null, 'link code is single-use');
  assert.equal(db.audit_logs.at(-1)!.action, 'telegram_linked');

  // Reusing the same code from another chat fails.
  await run(msg(222, '/start ST-ABC'));
  assert.match(calls.at(-1)!.payload.text, /not recognised or was already used/);
  assert.equal(db.notification_settings[0].telegram_chat_id, '111');

  // /due: overdue first, buttons only where an action makes sense (Vercel auto-renews: none).
  await run(msg(111, '/due'));
  const due = calls.at(-1)!.payload;
  assert.equal(due.parse_mode, 'HTML');
  assert.ok(due.text.indexOf('Rotate Stripe key') < due.text.indexOf('Namecheap'));
  assert.ok(!due.text.includes('Not yours'), 'other workspace items never shown');
  assert.deepEqual(
    due.reply_markup.inline_keyboard.map((r: any[]) => r.map((b) => b.callback_data)),
    [
      ['done|d-over|20261021', 's3|d-over|20261021', 's7|d-over|20261021'],
      ['paid|s-manual|20261107'],
      ['done|d-rec|20261112', 's3|d-rec|20261112', 's7|d-rec|20261112'],
    ]
  );

  // ✅ Done on a yearly date: marked done, next year's created, buttons replaced.
  calls.length = 0;
  await run(tap(111, 'done|d-rec|20261112', due.reply_markup));
  const rec = db.important_dates.find((d) => d.id === 'd-rec')!;
  assert.equal(rec.status, 'done');
  const nextYear = db.important_dates.find((d) => d.due_date === '2027-11-12');
  assert.ok(nextYear && nextYear.status === 'open' && nextYear.workspace_id === 'ws-1' && nextYear.id !== 'd-rec');
  const edit = calls.find((c) => c.method === 'editMessageReplyMarkup')!;
  assert.deepEqual(edit.payload.reply_markup.inline_keyboard[2], [{ text: '✔ Done · next one 2027-11-12', callback_data: 'noop' }]);
  assert.equal(answers(calls)[0].payload.text, 'Done · next one 2027-11-12');
  assert.equal(db.audit_logs.at(-1)!.changed_by, 'telegram');

  // Pressing it again does nothing.
  calls.length = 0;
  await run(tap(111, 'done|d-rec|20261112'));
  assert.equal(answers(calls)[0].payload.text, 'Already done.');
  assert.equal(calls.some((c) => c.method === 'editMessageReplyMarkup'), false);

  // 😴 3d on an overdue item counts from today (Nov 5), not from the old due date.
  await run(tap(111, 's3|d-over|20261021'));
  const over = db.important_dates.find((d) => d.id === 'd-over')!;
  assert.equal(over.status, 'snoozed');
  assert.equal(over.snoozed_until, '2026-11-08');

  // The old 😴 7d button from the same message is now stale.
  calls.length = 0;
  await run(tap(111, 's7|d-over|20261021'));
  assert.match(answers(calls)[0].payload.text, /out of date/);
  assert.equal(over.snoozed_until, '2026-11-08');

  // ✅ Paid moves the manual renewal one month on; the same button can't do it twice.
  await run(tap(111, 'paid|s-manual|20261107'));
  const nc = db.service_links.find((s) => s.id === 's-manual')!;
  assert.equal(nc.renewal_date, '2026-12-07');
  calls.length = 0;
  await run(tap(111, 'paid|s-manual|20261107'));
  assert.match(answers(calls)[0].payload.text, /out of date/);
  assert.equal(nc.renewal_date, '2026-12-07');

  // Someone else's item, an unlinked chat, a group chat, and a tampered payload are all refused.
  calls.length = 0;
  await run(tap(111, 'done|d-other|20261110'));
  assert.equal(answers(calls)[0].payload.text, 'Item not found.');
  assert.equal(db.important_dates.find((d) => d.id === 'd-other')!.status, 'open');
  await run(tap(555, 'done|d-over|20261108'));
  assert.match(answers(calls)[1].payload.text, /not linked/);
  await run({ callback_query: { id: 'x', data: 'done|d-over|20261108', message: { message_id: 1, chat: { id: -100, type: 'group' } } } });
  assert.match(answers(calls)[2].payload.text, /private chat/);
  await run(tap(111, 'delete|d-over|20261108'));
  assert.match(answers(calls)[3].payload.text, /no longer valid/);
  await run(tap(111, 'noop'));
  assert.equal(answers(calls)[4].payload.text, 'Already handled.');

  // Moving reminders to a new chat (new code) warns the old chat.
  db.notification_settings[0].telegram_verification_code = 'ST-NEW';
  calls.length = 0;
  await run(msg(333, '/start ST-NEW'));
  const warning = calls.find((c) => c.method === 'sendMessage' && c.payload.chat_id === '111');
  assert.ok(warning && /moved to another Telegram chat/.test(warning.payload.text), 'old chat is warned');
  assert.equal(db.notification_settings[0].telegram_chat_id, '333');
  assert.equal(db.audit_logs.at(-1)!.details, 'Telegram reminders moved to a different chat');
  await run(msg(333, '/start ST-ABC'));
  db.notification_settings[0].telegram_verification_code = 'ST-BACK';
  await run(msg(111, '/start ST-BACK'));

  // /stop unlinks the chat.
  await run(msg(111, '/stop'));
  assert.equal(db.notification_settings[0].telegram_chat_id, '');
  assert.equal(db.notification_settings[0].telegram_enabled, false);
});

// ---------- Telegram first, email as backup ----------
const alerts: DueAlert[] = [
  { itemId: 's-manual', itemType: 'serviceLink', title: 'Namecheap renewal', dueDate: '2026-11-12', leadDays: [7], productName: 'SaaS Boss', daysDiff: 7, leadDay: 7, amount: 20, currency: 'USD', autoRenew: false },
];
const settings = (over: Partial<SettingsRow>): SettingsRow => ({
  workspaceId: 'ws-1', email: 'me@example.com', emailEnabled: true, telegramChatId: '111', telegramEnabled: true,
  telegramVerificationCode: '', digestTime: '08:00', digestMode: 'daily', ...over,
});

async function withFetch(telegramOk: boolean, fn: () => Promise<void>) {
  const original = globalThis.fetch;
  const hits: string[] = [];
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.RESEND_API_KEY = 'test-key';
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    hits.push(u.includes('telegram') ? 'telegram' : u.includes('resend') ? 'email' : u);
    const ok = u.includes('telegram') ? telegramOk : true;
    return new Response(JSON.stringify(ok ? { ok: true, result: {} } : { ok: false, description: 'Forbidden: bot was blocked by the user' }), {
      status: ok ? 200 : 403,
    });
  }) as any;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
  return hits;
}

test('delivery: Telegram only when it works', async () => {
  let out: any;
  const hits = await withFetch(true, async () => {
    out = await deliverReminders({ settings: settings({}), workspaceName: 'W', alerts, etbPerUsd: 150 });
  });
  assert.deepEqual(hits, ['telegram']);
  assert.deepEqual(out.attempts, [{ channel: 'telegram', ok: true }]);
});

test('delivery: email backup when Telegram fails, both attempts recorded', async () => {
  let out: any;
  const hits = await withFetch(false, async () => {
    out = await deliverReminders({ settings: settings({}), workspaceName: 'W', alerts, etbPerUsd: 150 });
  });
  assert.deepEqual(hits, ['telegram', 'email']);
  assert.equal(out.attempts[0].ok, false);
  assert.match(out.attempts[0].error, /blocked by the user/);
  assert.deepEqual(out.attempts[1], { channel: 'email', ok: true });
});

test('delivery: email when Telegram is not linked; nothing when both are off', async () => {
  let out: any;
  let hits = await withFetch(true, async () => {
    out = await deliverReminders({ settings: settings({ telegramChatId: '' }), workspaceName: 'W', alerts, etbPerUsd: 150 });
  });
  assert.deepEqual(hits, ['email']);
  assert.equal(out.summary.telegram, 'not linked');

  hits = await withFetch(true, async () => {
    out = await deliverReminders({ settings: settings({ telegramEnabled: false, emailEnabled: false }), workspaceName: 'W', alerts, etbPerUsd: 150 });
  });
  assert.deepEqual(hits, []);
  assert.deepEqual(out.attempts, []);
  assert.equal(out.summary.email, 'backup off');
});
