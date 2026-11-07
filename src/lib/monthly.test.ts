/** The monthly summary from the bot (/month) and from the reminder job on the 1st. */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { handleTelegramUpdate } from './telegram-bot';
import { loadMoneyContext, sendMonthlySummary, type SettingsRow } from './reminders-server';
import { fakeAdmin, fakeTg } from './test-fakes';

const seed = (): Record<string, any[]> => ({
  workspaces: [{ id: 'ws-1', name: 'Yiro Studio', timezone: 'Africa/Addis_Ababa', exchange_rates: { ETB_per_USD: 150 } }],
  notification_settings: [{ workspace_id: 'ws-1', telegram_chat_id: '111', telegram_enabled: true, email_enabled: false }],
  products: [{ id: 'p-1', workspace_id: 'ws-1', name: 'SaaS Boss' }],
  payment_sources: [{ id: 'grey', workspace_id: 'ws-1', name: 'Grey', kind: 'card', currency: 'USD', prepaid: true, opening_balance: '40', archived: false }],
  service_links: [
    { id: 'vercel', workspace_id: 'ws-1', product_id: 'p-1', provider_name: 'Vercel', billing_cycle: 'monthly', cost: '20', currency: 'USD', renewal_date: '2026-11-25', status: 'active' },
  ],
  payments: [
    { id: 'a', workspace_id: 'ws-1', service_link_id: 'vercel', source_id: 'grey', paid_on: '2026-10-25', amount: '20', currency: 'USD', etb_paid: 3100, origin: 'auto_renew', receipt_id: 'r1' },
    { id: 'b', workspace_id: 'ws-1', service_link_id: 'vercel', source_id: 'grey', paid_on: '2026-09-25', amount: '20', currency: 'USD', origin: 'auto_renew' },
  ],
  source_transactions: [],
  reminder_logs: [],
});
const msg = (text: string) => ({ message: { message_id: 1, text, chat: { id: 111, type: 'private' } } });

test('/month: last month by default, any month on request', async () => {
  const db = seed();
  const { tg, calls } = fakeTg();
  const run = (t: string) => handleTelegramUpdate(msg(t), { admin: fakeAdmin(db), tg, now: new Date('2026-11-07T09:00:00Z') });

  await run('/month');
  const oct = calls.at(-1)!.payload;
  assert.equal(oct.parse_mode, 'HTML');
  assert.match(oct.text, /^📊 <b>October 2026 · Yiro Studio<\/b>/);
  assert.match(oct.text, /Spent \$20 \(ETB 3,100\) on 1 payment/);
  assert.match(oct.text, /Same as September \(\$20\)/);
  assert.match(oct.text, /📅 Coming up in November: 1 renewal, about \$20\./);
  assert.ok(!oct.text.includes('no receipt'), 'the October payment has its receipt');

  await run('/month 2026-09');
  const sep = calls.at(-1)!.payload.text;
  assert.match(sep, /September 2026/);
  assert.match(sep, /≈ ETB 3,000/);
  assert.match(sep, /🧾 1 payment has no receipt yet\./);
  assert.ok(!sep.includes('Coming up'), 'only for last month');

  await run('/month october');
  assert.match(calls.at(-1)!.payload.text, /Usage: \/month/);
});

test('the 1st of the month: summary sent once, with a log row so it is not repeated', async () => {
  const sent: any[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      sent.push(JSON.parse(raw));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true,"result":{}}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_API_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const db = seed();
    const admin = fakeAdmin(db);
    const money = (await loadMoneyContext(admin, 'ws-1'))!;
    const settings = { workspaceId: 'ws-1', telegramChatId: '111', telegramEnabled: true, emailEnabled: false } as SettingsRow;
    const now = new Date('2026-11-01T05:00:00Z');
    const r = await sendMonthlySummary(admin, { ws: { id: 'ws-1', name: 'Yiro Studio' }, settings, money, etbPerUsd: 150, month: '2026-10', appUrl: 'https://saas-boss-v20.vercel.app', now });
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /^📊 <b>October 2026 · Yiro Studio<\/b>/);
    assert.match(sent[0].text, /<a href="https:\/\/saas-boss-v20\.vercel\.app">Open Cards &amp; Payments<\/a>$/);
    assert.deepEqual(r!.logRows, [
      { workspace_id: 'ws-1', item_type: 'workspace', item_id: 'ws-1:month:2026-10', channel: 'telegram', lead_day: 0, sent_at: now.toISOString(), status: 'sent' },
    ]);
    // Nothing paid and nothing coming up: no message at all.
    const empty = await sendMonthlySummary(admin, { ws: { id: 'ws-1', name: 'Yiro Studio' }, settings, money: { ...money, payments: [], services: [] }, etbPerUsd: 150, month: '2026-10', now });
    assert.equal(empty, null);
    assert.equal(sent.length, 1);
  } finally {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_API_BASE;
    server.close();
  }
});
