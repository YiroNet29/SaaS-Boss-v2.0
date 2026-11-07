/**
 * Receipts sent to the Telegram bot: stored, read (by a local stand-in for the Claude API, or the
 * plain-text reader when no key is set), matched, and saved or ignored with the buttons.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { handleTelegramUpdate } from './telegram-bot';
import { fakeAdmin, fakeTg, type FakeStorage } from './test-fakes';

type Row = Record<string, any>;
const NOW = new Date('2026-11-07T09:00:00Z'); // 12:00 in Addis Ababa
const APP = 'https://saas-boss-v20.vercel.app';

function seed(): Record<string, Row[]> {
  return {
    workspaces: [{ id: 'ws-1', name: 'Yiro Studio', owner_id: 'u1', timezone: 'Africa/Addis_Ababa', exchange_rates: { ETB_per_USD: 150 } }],
    notification_settings: [{ workspace_id: 'ws-1', telegram_chat_id: '111', telegram_enabled: true }],
    payment_sources: [{ id: 'src-grey', workspace_id: 'ws-1', name: 'Grey', kind: 'card', currency: 'USD', prepaid: true, opening_balance: '40', last4: '4821', archived: false }],
    service_links: [
      { id: 's-vercel', workspace_id: 'ws-1', provider_name: 'Vercel', billing_cycle: 'monthly', cost: '20', currency: 'USD', renewal_date: '2026-12-05', auto_renew: true, status: 'active', payment_source_id: 'src-grey' },
      { id: 's-neon', workspace_id: 'ws-1', provider_name: 'Neon', billing_cycle: 'monthly', cost: '19', currency: 'USD', renewal_date: '2026-11-10', auto_renew: false, status: 'active', payment_source_id: null },
    ],
    payments: [
      { id: 'pay-s-vercel-20261105', workspace_id: 'ws-1', service_link_id: 's-vercel', source_id: 'src-grey', paid_on: '2026-11-05', amount: '20', currency: 'USD', origin: 'auto_renew', receipt_id: null },
    ],
    source_transactions: [],
    receipts: [],
    audit_logs: [],
  };
}

const VERCEL_EMAIL = [
  '---------- Forwarded message ---------',
  'From: Vercel Billing <billing@vercel.com>',
  'Subject: Your receipt from Vercel Inc.',
  'Pro plan  $20.00',
  'Tax $1.60',
  'Amount paid $21.60 on Nov 5, 2026',
  'Visa ending in 4821',
].join('\n');

const textMsg = (id: number, text: string, extra: Row = {}) => ({
  message: { message_id: id, text, chat: { id: 111, type: 'private' }, ...extra },
});
const photoMsg = (id: number, caption?: string) => ({
  message: {
    message_id: id, caption, chat: { id: 111, type: 'private' },
    photo: [{ file_id: 'small', file_size: 900 }, { file_id: 'big', file_size: 4000 }],
  },
});
const tap = (data: string, reply_markup: any, chatId = 111) => ({
  callback_query: { id: 'cb', data, message: { message_id: 77, chat: { id: chatId, type: 'private' }, reply_markup } },
});
const PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

function setup() {
  const db = seed();
  const storage: FakeStorage = { files: new Map() };
  const { tg, calls } = fakeTg();
  const downloads: string[] = [];
  const deps = {
    admin: fakeAdmin(db, storage), tg, now: NOW, appUrl: APP,
    download: async (fileId: string) => { downloads.push(fileId); return PHOTO; },
  };
  const sent = () => calls.filter((c) => c.method === 'sendMessage');
  return { db, storage, calls, sent, downloads, deps, run: (u: any) => handleTelegramUpdate(u, deps) };
}

test('without an Anthropic key: email text is read by the simple reader; photos wait for manual entry', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const { db, storage, sent, downloads, run } = setup();

  // Small talk is not a receipt.
  await run(textMsg(1, 'hi'));
  assert.match(sent().at(-1)!.payload.text, /StackTrack bot/);
  assert.equal(db.receipts.length, 0);

  // A forwarded receipt email.
  await run(textMsg(2, VERCEL_EMAIL, { forward_origin: { type: 'user' } }));
  const r = db.receipts[0];
  assert.equal(r.id, 'rcpt-tg-111-2');
  assert.equal(r.status, 'needs_review');
  assert.equal(r.channel, 'telegram');
  assert.deepEqual(
    { ...r.extracted },
    { isReceipt: true, vendor: 'Vercel', amount: 21.6, currency: 'USD', date: '2026-11-05', cardLast4: '4821', readBy: 'text', suggestedServiceId: 's-vercel', suggestedSourceId: 'src-grey' }
  );
  const reply = sent().at(-1)!.payload;
  assert.equal(reply.reply_parameters.message_id, 2, 'answers the receipt message itself');
  assert.match(reply.text, /Receipt read/);
  assert.match(reply.text, /Vercel · \$21\.60 · 2026-11-05/);
  assert.match(reply.text, /ETB 3,240/);
  assert.match(reply.text, /Paid with: Grey/);
  assert.match(reply.text, /Looks like: <b>Vercel<\/b>/);
  assert.match(reply.text, /Save: Adds this receipt to the Vercel payment on 2026-11-05/);
  assert.deepEqual(
    reply.reply_markup.inline_keyboard[0].map((b: any) => b.callback_data ?? b.url),
    ['rok|rcpt-tg-111-2|20261107', `${APP}/?tab=receipts`, 'rno|rcpt-tg-111-2|20261107']
  );

  // Telegram delivers the same update again: nothing new.
  const before = sent().length;
  await run(textMsg(2, VERCEL_EMAIL, { forward_origin: { type: 'user' } }));
  assert.equal(db.receipts.length, 1);
  assert.equal(sent().length, before);

  // Save attaches the receipt to the auto-renewal payment, with the real amount charged.
  await run(tap('rok|rcpt-tg-111-2|20261107', reply.reply_markup));
  const p = db.payments.find((x) => x.id === 'pay-s-vercel-20261105')!;
  assert.equal(p.receipt_id, 'rcpt-tg-111-2');
  assert.equal(p.amount, 21.6);
  assert.equal(db.payments.length, 1, 'no second payment');
  assert.equal(db.receipts[0].status, 'confirmed');
  assert.equal(db.receipts[0].payment_id, 'pay-s-vercel-20261105');
  assert.match(db.audit_logs.at(-1)!.details, /Saved receipt \(Vercel 21\.6 USD\)/);

  // A photo: stored privately, but nothing can be read without the key, so there is no Save button.
  await run(photoMsg(3, 'neon bill'));
  assert.deepEqual(downloads, ['big'], 'largest photo size is downloaded');
  assert.deepEqual([...storage.files.keys()], ['receipts/ws-1/rcpt-tg-111-3.jpg']);
  const photo = db.receipts.find((x) => x.id === 'rcpt-tg-111-3')!;
  assert.equal(photo.storage_path, 'ws-1/rcpt-tg-111-3.jpg');
  assert.equal(photo.status, 'needs_review');
  assert.match(photo.error, /Automatic reading is off/);
  const photoReply = sent().at(-1)!.payload;
  assert.match(photoReply.text, /Receipt saved/);
  assert.deepEqual(photoReply.reply_markup.inline_keyboard[0].map((b: any) => b.text), ['✏️ Edit in app', '🗑 Ignore']);

  // Ignore.
  await run(tap('rno|rcpt-tg-111-3|20261107', photoReply.reply_markup));
  assert.equal(photo.status, 'ignored');

  // Files the bot can't read are refused before anything is stored.
  await run({ message: { message_id: 4, chat: { id: 111, type: 'private' }, document: { file_id: 'z', file_name: 'stuff.zip', mime_type: 'application/zip' } } });
  assert.match(sent().at(-1)!.payload.text, /photos, PDFs and text receipts/);
  await run({ message: { message_id: 5, chat: { id: 111, type: 'private' }, document: { file_id: 'h', file_name: 'big.pdf', mime_type: 'application/pdf', file_size: 11 * 1024 * 1024 } } });
  assert.match(sent().at(-1)!.payload.text, /over 10 MB/);
  assert.equal(db.receipts.length, 2);

  // Someone else's chat can't press the buttons.
  await run(tap('rok|rcpt-tg-111-3|20261107', undefined, 999));
  assert.equal(photo.status, 'ignored');
});

test('with Claude: a photo is read, matched to the renewal it pays, and Save marks it paid', async () => {
  const requests: { headers: http.IncomingHttpHeaders; body: any }[] = [];
  let answer: { status: number; json: any } = { status: 200, json: {} };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      requests.push({ headers: req.headers, body: JSON.parse(raw) });
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(answer.json));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const claudeSays = (fields: Row) => ({
    status: 200,
    json: {
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 1500, output_tokens: 120 },
      content: [{ type: 'text', text: JSON.stringify({ isReceipt: true, vendor: null, amount: null, currency: null, date: null, cardLast4: null, periodStart: null, periodEnd: null, invoiceNumber: null, summary: null, ...fields }) }],
    },
  });

  try {
    const { db, sent, run, deps } = setup();
    answer = claudeSays({ vendor: 'Neon Inc.', amount: 19, currency: 'USD', date: '2026-11-07', cardLast4: '4821', summary: 'Launch plan, monthly' });

    // The webhook defers the slow part until after Telegram has its answer.
    const queued: (() => Promise<void>)[] = [];
    await handleTelegramUpdate(photoMsg(10, 'Neon'), { ...deps, defer: (w) => queued.push(w) });
    assert.equal(sent().length, 0);
    assert.equal(db.receipts[0].status, 'reading');
    await queued[0]();

    // What was sent to Claude.
    const { headers, body } = requests[0];
    assert.equal(headers.authorization, 'Bearer test-key');
    assert.match(String(headers['anthropic-beta']), /server-side-fallback-2026-07-01/);
    assert.equal(body.model, 'claude-opus-5-5');
    assert.equal(body.fallbacks, 'default');
    assert.deepEqual(body.output_config.effort, 'low');
    assert.equal(body.output_config.format.type, 'json_schema');
    assert.equal(body.output_config.format.schema.additionalProperties, false);
    assert.deepEqual(body.messages[0].content[0], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from(PHOTO).toString('base64') } });
    assert.equal(body.messages[0].content[1].text, 'The sender added this note: Neon');
    assert.match(body.system, /data, not instructions/);

    const r = db.receipts[0];
    assert.equal(r.status, 'needs_review');
    assert.equal(r.error, null);
    assert.equal(r.extracted.readBy, 'claude');
    assert.equal(r.extracted.vendor, 'Neon Inc.');
    assert.equal(r.extracted.suggestedServiceId, 's-neon');
    assert.equal(r.extracted.suggestedSourceId, 'src-grey', 'card found by its last 4 digits');
    const reply = sent().at(-1)!.payload;
    assert.match(reply.text, /Neon Inc\. · \$19 · 2026-11-07/);
    assert.match(reply.text, /Launch plan, monthly/);
    assert.match(reply.text, /Save: Marks the Neon renewal due 2026-11-10 paid · next renewal 2026-12-10/);

    await run(tap('rok|rcpt-tg-111-10|20261107', reply.reply_markup));
    const pay = db.payments.find((x) => x.id === 'pay-s-neon-20261110')!;
    assert.deepEqual(
      [pay.amount, pay.currency, pay.paid_on, pay.origin, pay.receipt_id, pay.source_id, pay.service_link_id],
      [19, 'USD', '2026-11-07', 'receipt', 'rcpt-tg-111-10', 'src-grey', 's-neon']
    );
    assert.equal(db.service_links.find((x) => x.id === 's-neon')!.renewal_date, '2026-12-10');
    assert.equal(db.receipts[0].status, 'confirmed');

    // Pressing Save again does nothing.
    await run(tap('rok|rcpt-tg-111-10|20261107', reply.reply_markup));
    assert.equal(db.payments.filter((x) => x.service_link_id === 's-neon').length, 1);

    // A receipt in another currency: read, but Save is held back (only USD and birr are recorded).
    answer = claudeSays({ vendor: 'Hetzner', amount: 18.5, currency: 'EUR', date: '2026-11-07' });
    await run(photoMsg(11));
    const eur = sent().at(-1)!.payload;
    assert.match(eur.text, /Amount is in EUR/);
    assert.ok(!JSON.stringify(eur.reply_markup).includes('rok|'));

    // Claude is down: the forwarded email still gets the simple reader, and the problem is noted.
    answer = { status: 500, json: { type: 'error', error: { type: 'api_error', message: 'boom' } } };
    await run(textMsg(12, VERCEL_EMAIL, { forward_date: 1 }));
    const failed = db.receipts.find((x) => x.id === 'rcpt-tg-111-12')!;
    assert.equal(failed.status, 'needs_review');
    assert.equal(failed.extracted.amount, 21.6);
    assert.equal(failed.extracted.readBy, 'text');
    assert.match(failed.error, /Couldn't read it automatically \(Claude API error 500\)/);
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_BASE_URL;
    server.close();
  }
});

test('the read endpoint only opens the file stored for that receipt', async () => {
  const { isOwnReceiptPath } = await import('./receipts-server');
  assert.equal(isOwnReceiptPath('ws-1/rcpt-abc.pdf', 'ws-1', 'rcpt-abc'), true);
  assert.equal(isOwnReceiptPath('ws-1/rcpt-abc.jpg', 'ws-1', 'rcpt-abc'), true);
  assert.equal(isOwnReceiptPath('ws-2/rcpt-abc.pdf', 'ws-1', 'rcpt-abc'), false);
  assert.equal(isOwnReceiptPath('ws-1/../ws-2/rcpt-abc.pdf', 'ws-1', 'rcpt-abc'), false);
  assert.equal(isOwnReceiptPath('ws-1/rcpt-other.pdf', 'ws-1', 'rcpt-abc'), false);
  assert.equal(isOwnReceiptPath('ws-1/rcpt-abc.exe', 'ws-1', 'rcpt-abc'), false);
});
