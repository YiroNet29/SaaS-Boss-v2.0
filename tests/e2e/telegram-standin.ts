import http from 'node:http';
import { expect } from '@playwright/test';
import { TELEGRAM_STANDIN_PORT } from './ports';

/** A message the bot sent. */
export interface Sent {
  chat_id: string | number;
  text: string;
  message_id: number;
  reply_markup?: { inline_keyboard: { text: string; callback_data?: string; url?: string }[][] };
}

// A tiny 1×1 JPEG, served as the "photo" someone sent the bot.
const PHOTO = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');

/**
 * A pretend Telegram Bot API. The app (started with TELEGRAM_API_BASE pointing here) talks to it as if it were
 * Telegram; the test reads what the bot sent and delivers "your" messages and button taps to the app's webhook.
 */
export class TelegramStandIn {
  webhook: string | null = null;
  secret: string | null = null;
  commands: string[] = [];
  sent: Sent[] = [];
  answers: { callback_query_id: string; text?: string }[] = [];
  private nextId = 100;
  private updateId = 1;
  private server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (req.url?.startsWith('/file/')) {
        res.writeHead(200, { 'content-type': 'image/jpeg' });
        res.end(PHOTO);
        return;
      }
      const method = req.url?.split('/').pop() ?? '';
      const body = raw ? JSON.parse(raw) : {};
      let result: unknown = true;
      if (method === 'getMe') result = { id: 1, is_bot: true, first_name: 'StackTrack', username: 'StackTrackTestBot' };
      if (method === 'setWebhook') { this.webhook = body.url; this.secret = body.secret_token; }
      if (method === 'getWebhookInfo') result = { url: this.webhook ?? '', pending_update_count: 0 };
      if (method === 'setMyCommands') this.commands = body.commands.map((c: { command: string }) => c.command);
      if (method === 'sendMessage') {
        result = { message_id: this.nextId++ };
        this.sent.push({ ...body, message_id: (result as { message_id: number }).message_id });
      }
      if (method === 'answerCallbackQuery') this.answers.push(body);
      if (method === 'getFile') result = { file_id: body.file_id, file_path: 'photos/receipt.jpg', file_size: PHOTO.length };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result }));
    });
  });

  constructor(readonly chatId = 424242) {}

  start() {
    return new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(TELEGRAM_STANDIN_PORT, '127.0.0.1', () => resolve());
    });
  }
  stop() {
    return new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  /** Delivers an update to the app's webhook, the way Telegram would. Returns the HTTP status. */
  async deliver(update: Record<string, unknown>) {
    expect(this.webhook, 'the app has set its webhook').toBeTruthy();
    const res = await fetch(this.webhook!, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': this.secret ?? '' },
      body: JSON.stringify({ update_id: this.updateId++, ...update }),
    });
    return res.status;
  }
  /** You send the bot a message (text, or a photo with a caption, …). */
  say(text: string | undefined, extra: Record<string, unknown> = {}) {
    return this.deliver({
      message: { message_id: this.updateId + 1000, date: Math.floor(Date.now() / 1000), text, chat: { id: this.chatId, type: 'private' }, ...extra },
    });
  }
  /** You tap a button under one of the bot's messages. */
  tap(msg: Sent, data: string) {
    return this.deliver({
      callback_query: { id: `cb${this.updateId}`, data, message: { message_id: msg.message_id, chat: { id: this.chatId, type: 'private' }, reply_markup: msg.reply_markup } },
    });
  }
  /** Waits for the bot to send you a message that matches. */
  async waitForMessage(match: (m: Sent) => boolean, what: string): Promise<Sent> {
    let found: Sent | undefined;
    await expect
      .poll(() => {
        found = [...this.sent].reverse().find((m) => String(m.chat_id) === String(this.chatId) && match(m));
        return Boolean(found);
      }, { message: `the bot sends ${what}`, timeout: 20000 })
      .toBe(true);
    return found!;
  }
  button(msg: Sent, label: RegExp) {
    const b = msg.reply_markup?.inline_keyboard.flat().find((x) => label.test(x.text));
    expect(b, `a ${label} button`).toBeTruthy();
    return b!.callback_data!;
  }
}
