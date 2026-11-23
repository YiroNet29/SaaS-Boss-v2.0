#!/usr/bin/env node
/**
 * Writes .env.development.local for `npm run dev:local`, pointing the app at the local Supabase
 * stack (npm run local:start). Next.js reads this file only in development, ahead of .env.local,
 * so your real settings are never used by a local run and never overwritten.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CLI = ['--yes', 'supabase@3.0.0'];
let status;
try {
  // Windows runs npx through npx.cmd, which needs a shell.
  const win = process.platform === 'win32';
  status = JSON.parse(
    execFileSync(win ? 'npx.cmd' : 'npx', [...CLI, 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: win })
  );
} catch {
  console.error('The local Supabase stack is not running. Start it with: npm run local:start');
  process.exit(1);
}

const api = status.API_URL;
const anon = status.ANON_KEY || status.PUBLISHABLE_KEY;
const service = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
if (!api || !anon || !service) {
  console.error('Unexpected `supabase status` output; is the stack fully started?');
  process.exit(1);
}

const lines = [
  '# Written by `npm run local:env` for the LOCAL Supabase stack. Not committed (see .gitignore).',
  '# Delete this file to run `next dev` against your own .env.local settings again.',
  `NEXT_PUBLIC_SUPABASE_URL=${api}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${anon}`,
  `SUPABASE_URL=${api}`,
  `SUPABASE_SERVICE_ROLE_KEY=${service}`,
  `SUPABASE_SECRET_KEY=${service}`,
  // localhost, not 127.0.0.1: browsers only allow passkeys (app lock) on a name, not an IP address.
  'NEXT_PUBLIC_APP_URL=http://localhost:3210',
  'CRON_SECRET=local-cron-secret',
  '# Local runs never use your real Telegram bot (its webhook must stay on the live site).',
  'TELEGRAM_BOT_TOKEN=',
  'TELEGRAM_WEBHOOK_SECRET=',
  '',
];
writeFileSync('.env.development.local', lines.join('\n'));
console.log(`Wrote .env.development.local → Supabase ${api}, app http://localhost:3210`);
console.log(`Studio (database browser): ${status.STUDIO_URL}   Emails (password reset): ${status.MAILPIT_URL ?? status.INBUCKET_URL}`);
