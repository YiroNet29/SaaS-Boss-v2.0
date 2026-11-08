# StackTrack: SaaS Stack & Renewal Tracker

A mobile-first web app for solo founders and multi-product studios. Track every service subscription, domain renewal, SSL expiry and key-rotation date across many SaaS apps, without storing secret keys.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Supabase (Postgres + Auth) · Vercel · cron-job.org

---

## Features

- **Multi-workspace:** every row is scoped by `workspace_id`, and Postgres Row Level Security means users only ever see workspaces they own or belong to.
- **Demo mode:** explore 3 sample stacks with no account. "Import to Live" copies them into your real workspace.
- **Zero-secret vault references:** warns if you paste Stripe/Google/GitHub/Slack keys or PEM private keys. Only vault references are stored.
- **USD & ETB side by side,** with a stale exchange-rate reminder.
- **Dashboard:** stack health score, domain expiry alerts, cost summary, renewal spotlight, 12-month cash-flow forecast, provider concentration ("blast radius") and spend trend.
- **Templates & cloning:** stamp out a standard stack, clone a product, duplicate a service to many products, bulk-edit.
- **Important dates:** recurring dates, snooze, mark done, calendar view, `.ics` export.
- **Reminders:** an hourly job sends an email (Resend) and/or Telegram digest at each workspace's chosen local time. It dedupes per renewal cycle, then sends overdue items daily for 3 days and weekly after that.
- **Telegram bot:** `/start <code>`, `/due`, `/week`, `/snooze <id> <days>`, `/stop`. Send it a receipt (photo, PDF or forwarded email) to file it.
- **Cards & Payments:** who pays for what (virtual cards, a friend who pays for you), balances, top-up planner, card expiry, payment history.
- **Receipts inbox:** receipts from Telegram or uploaded in the app are read by Claude, matched to the service and card, and recorded once you confirm.
- **Monthly summary:** on the 1st, Telegram gets last month's spending in USD and birr, by product, by card or person and the biggest services, plus receipts still missing and what's due this month. `/month` (or `/month 2026-10`) asks for it any time; Cards & Payments shows the same per month.
- **Patchy connection friendly:** a change made while offline waits in the open tab and is saved, in order, as soon as the connection is back ("Back online: 2 changes saved"). Live data is never stored on the device, so keep the tab open until then; the browser warns before you close it.
- **Live updates:** a receipt sent to the bot, a ✅ Paid pressed in Telegram or a date moved by the hourly job shows up in the open app without a reload.
- **Automatic expiry checks:** domain dates follow the registry (RDAP) and SSL dates follow the site's certificate, checked daily; renewals move the date by themselves and problems come to Telegram. Domains without a public lookup (like `.et`) stay manual with reminders from 60 days.
- **CSV import/export, JSON backup, installable PWA.**

---

## Project layout

```
app/
  layout.tsx, page.tsx, ClientApp.tsx   # Next.js shell (the app UI is client-rendered)
  globals.css                           # Tailwind v4 + themes
  auth/callback/route.ts                # Supabase OAuth / email-link callback
  api/cron/reminders/route.ts           # Hourly reminder job (called by cron-job.org)
  api/telegram/webhook/route.ts         # Telegram bot webhook
src/
  App.tsx                               # Providers + sign-in gate
  context/                              # Auth, Workspace (state + Supabase sync), Theme
  lib/db.ts                             # Row mapping + ordered write queue to Supabase
  lib/supabase/                         # Browser and server Supabase clients
  lib/reminders-server.ts               # Email/Telegram senders, candidate loading
  utils/                                # Pure logic (cost, reminders, digests, csv, ics…) + tests
  components/                           # UI
supabase/migrations/0001_init.sql       # Database schema + Row Level Security
public/                                 # PWA manifest, icon, service worker
tests/e2e/                              # Browser tests against the local Docker stack (npm run test:e2e)
docs/checklist.json                     # The project checklist (copy of the shared checklist page)
```

---

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the values (see below)
npm run dev                  # http://localhost:3000
```

Without Supabase values the app still runs in **demo mode**.

### Full local stack with Docker

A private copy of Supabase (database, login with 2FA, file storage, live updates) runs in Docker on your
computer, with every migration applied. It is built to sit next to other Docker projects:

- containers, network and volumes are all named `…_stacktrack_local`;
- it only uses ports **55620–55629** (Supabase's defaults are 543xx), and the app runs on **3210**;
- start/stop/reset commands only act on this project. Don't add `--all` to `supabase stop`: that stops
  every Supabase project on the machine.

```bash
npm run local:start   # first run downloads the images (a few GB); then writes .env.development.local
```

```bash
npm run dev:local     # open http://localhost:3210, then "Create account" (local sign-ups need no email)
```

- Use **localhost**, not 127.0.0.1, in the browser: passkeys (app lock) only work on a name, not an IP address.
- Database browser (Supabase Studio): http://127.0.0.1:55623 · Emails such as password resets: http://127.0.0.1:55624
- `npm run local:stop` stops it and keeps the data. `npm run local:reset` wipes the local data and re-applies the migrations.
- A port already in use? Change the `556xx` numbers in `supabase/config.toml`, then run `npm run local:start` again.
- Start says the database isn't ready (for example after Docker was force-quit)? It is recovering; run
  `npm run local:start` again a minute later. Your local data is kept.
- Images won't download (the default registry is `public.ecr.aws`)? Prefix the start command with
  `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` to use Docker Hub instead.
- Local runs never use your real Telegram bot (its webhook has to stay on the live site). To try the hourly
  job by hand:

  ```bash
  curl -H "Authorization: Bearer local-cron-secret" "http://localhost:3210/api/cron/reminders?force=1"
  ```
- To have Claude read receipts locally, put `ANTHROPIC_API_KEY` in `.env.local`. `.env.development.local` is
  rewritten by `local:start`; anything it doesn't set comes from `.env.local`.

```bash
npm test        # unit tests (node:test)
npm run lint    # type-check
npm run build   # production build
```

### End-to-end tests

35 tests click through the app in a real browser against the local Docker stack (about 4 minutes): products,
services, dates, import/export, cards and payments, receipts, sign-up and password reset, two-factor login
(including that the database refuses a password-only session), app lock and passkeys, live updates and
offline saving, the phone layout, and the Telegram bot against a pretend Telegram. Every test signs up its own
new account, so they never touch your local data.

Once, to download the test browser:

```bash
npx playwright install chromium
```

Then, with the local stack running (`npm run local:start`) and `npm run dev:local` **stopped** (the tests start
their own copy on port 3210, wired to the pretend Telegram on port 55625):

```bash
npm run test:e2e
```

- One file: `npm run test:e2e -- money`. Watch it in a browser window: `npm run test:e2e -- --headed`.
- A failed test leaves a screenshot in `test-results/`.
- The tests never call the real Telegram, Claude API or exchange-rate service.

---

## Setup guide

### 1. Supabase (database + login)

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**: paste the whole of `supabase/migrations/0001_init.sql`, click **Run**. Then do the same with `supabase/migrations/0002_security.sql` (two-factor enforcement and passkeys), `supabase/migrations/0003_payments.sql` (cards, payments, receipts), `supabase/migrations/0004_expiry_checks.sql` (automatic domain and SSL checks) and `supabase/migrations/0005_realtime.sql` (live updates). All are safe to re-run.
3. **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server only, never share it)
4. **Authentication → URL Configuration**:
   - Site URL: your production URL, e.g. `https://stacktrack.vercel.app`
   - Redirect URLs: add `https://stacktrack.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`
5. *(Optional)* **Google sign-in:** Authentication → Providers → Google. Create an OAuth client in Google Cloud Console and paste its client ID and secret. The authorized redirect URI is the one Supabase shows there.

### 2. Deploy to Vercel

1. Push this folder to a GitHub repo.
2. In [vercel.com](https://vercel.com): **Add New → Project**, import the repo. The framework is detected as Next.js automatically.
3. Add every variable from `.env.example` under **Settings → Environment Variables**. Set `NEXT_PUBLIC_APP_URL` to your Vercel URL.
4. Deploy. Then put the final URL into Supabase's Site URL and Redirect URLs (step 1.4).

> **Why Vercel over Cloudflare?** Vercel builds Next.js and supports every Next.js 16 feature with zero config. Cloudflare needs the OpenNext adapter, which usually lags behind new Next.js releases. The free Vercel plan only allows a once-a-day built-in cron, which is why reminders run through cron-job.org (step 3).

### 3. Hourly reminders with cron-job.org

1. Generate a secret, e.g. `openssl rand -hex 32`, and set it as `CRON_SECRET` in Vercel (then redeploy).
2. In [cron-job.org](https://cron-job.org) → **Create cronjob**:
   - URL: `https://<your-app>/api/cron/reminders`
   - Schedule: **every hour, at minute 0**
   - Advanced → Request method `GET`, add header `Authorization` = `Bearer <CRON_SECRET>`
3. Test it once by hand. Adding `?force=1` ignores the digest-hour check:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-app>/api/cron/reminders?force=1"
```

The response lists what was sent or skipped for each workspace. Each workspace is processed when its **local** hour (Settings → timezone) matches its **digest time**.

### 4. Email via Resend (optional)

1. Create an API key at [resend.com](https://resend.com) → `RESEND_API_KEY`.
2. Verify your sending domain and set `REMINDER_FROM_EMAIL`, e.g. `StackTrack <reminders@yourdomain.com>`. Until a domain is verified, Resend only delivers to your own address.
3. In the app: **Settings → Notifications**, enter the email and tick **Enable Email Delivery**.

### 5. Telegram reminders (main channel)

1. In Telegram, talk to [@BotFather](https://t.me/BotFather) → `/newbot`, and copy the token.
2. Vercel → Environment Variables:
   - `TELEGRAM_BOT_TOKEN` = the token
   - `TELEGRAM_WEBHOOK_SECRET` = any long string of letters, numbers, `_` or `-`

   Then redeploy.
3. In the app: **Settings → Telegram reminders**. Follow the checklist: **Set up bot** (connects the bot to
   the app and sets its command menu), then **Connect Telegram** and press **Start** in Telegram.
4. Click **Send test** in Settings. You should get a reminder with ✅ Done / 😴 Snooze / ✅ Paid buttons.

Reminders go to Telegram first. Email (Resend) is only used as a backup when Telegram isn't linked,
is switched off, or can't be reached. Bot commands: `/due`, `/week`, `/month`, `/help`, `/stop`. The bot ignores
group chats and only acts on items in workspaces linked to your chat.

### 6. Automatic domain and SSL checks

Needs `0004_expiry_checks.sql` (step 1). Nothing to configure: the hourly cron job does it.

- Add or edit a date of type **Domain expiry** or **SSL expiry**, fill in **Domain to check** / **Website to check**
  (e.g. `saasboss.io`, `app.saasboss.io`), keep **Check automatically every day** on, and use **Look up now** to fill
  in the date.
- Each date is checked about once a day. When a domain is renewed, its date moves and Telegram tells you. Telegram
  also warns when a lookup starts failing or a certificate isn't trusted (expired, wrong name, self-signed).
- `.et` and other domains without a public lookup can't be checked: the date stays manual and reminders start 60
  days before.
- The dates list shows the last check, with a **Check now** button.
- The checker only connects to public addresses.

### 7. Receipts read by Claude (optional)

Send the bot a photo or PDF of a receipt, or forward the receipt email to it. If your chat is linked to more
than one workspace, receipts go to the one you connected most recently, and the bot's reply names it. You can also use the
**Receipts** page (Add photo or PDF / Paste email text).

1. Create an API key at [console.anthropic.com](https://console.anthropic.com) (Settings → API keys) and add a
   little credit.
2. Vercel → Environment Variables: `ANTHROPIC_API_KEY` = the key, then redeploy. Don't paste the key anywhere else.
3. Send the bot a receipt. It answers with what it read and **✅ Save / ✏️ Edit in app / 🗑 Ignore**.

Receipts are read by `claude-opus-5-5` at low effort, which costs a few US cents per receipt (more for long PDFs). Set
`ANTHROPIC_MODEL` to use a different model. Without a key, forwarded email text is still read by a simple
built-in reader, and photos/PDFs are saved for you to type in. Nothing is recorded as paid until you confirm.

---

## Two-factor login

Settings → **Security → Two-factor login → Turn on**, scan the QR code with an authenticator app (Google
Authenticator, Authy, 1Password…) and enter the code. From then on, sign-in asks for a 6-digit code, and the
database refuses password-only sessions (`0002_security.sql` must have been run).

Add a **backup device** (a second phone or a password manager) so a lost phone doesn't lock you out.

**Lost every device?** In Supabase → **Authentication → Users**, open your user and delete its MFA factors.
Or run this in the SQL Editor: `delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'you@example.com');`
Then sign in with your password and turn 2FA on again.

## Backups

Supabase's free plan keeps no backups, so a GitHub Action (`.github/workflows/backup.yml`) dumps the
database every night at 03:23 Addis Ababa time, **encrypts it with your passphrase**, and keeps each file
for 30 days under the repo's **Actions** tab. Encryption matters because the repository is public.

### Set up (once)
1. Supabase → **Connect** (top bar) → **Session pooler** → copy the connection string. Replace
   `[YOUR-PASSWORD]` with your database password. If the password contains `@ : / ? # %`, reset it in
   Project Settings → Database to one with only letters and numbers.
   (The "Direct connection" string won't work from GitHub: it needs IPv6.)
2. Make up a backup passphrase of **at least 16 characters** and store it in your password manager.
   Without it the backups can't be opened.
3. GitHub → this repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_DB_URL` = the connection string from step 1
   - `BACKUP_PASSPHRASE` = the passphrase from step 2
4. **Actions → Nightly database backup → Run workflow** to make the first backup now. It should finish
   green with a `stacktrack-db-backup-…` file attached.

GitHub pauses scheduled workflows in a repo with no commits for 60 days; open Actions and re-enable it if that happens.

### Restore
Download the backup zip from the workflow run, unzip it, then:

```bash
gpg --decrypt stacktrack-YYYY-MM-DD.sql.gz.gpg | gunzip > stacktrack.sql
```

```bash
psql "<SESSION POOLER CONNECTION STRING>" -v ON_ERROR_STOP=1 -f stacktrack.sql
```

Restore into a **new, empty** Supabase project (or drop the StackTrack tables first). Then:

1. In the SQL Editor, run `0001` to `0005` from `supabase/migrations` again, in order. They're safe to re-run
   and bring back what lives outside the tables: the private `receipts` storage bucket with its access rules,
   and live updates.
2. Sign up in the app once on the new project, then point your data at your new user id in the SQL Editor:
   `update workspaces set owner_id = (select id from auth.users limit 1);`

The backup holds all your data, including each receipt's details, but **not the receipt files** (photos
and PDFs). Those stay in Supabase Storage.

This was rehearsed on the local Docker stack: backup, wipe, restore, re-run the migrations. All data,
access rules, storage rules and live updates came back.

## Security notes

- **Row Level Security** on every table: you only see your own workspaces. Only the owner can edit or delete
  a workspace, and ownership can't be reassigned from the browser.
- **Two-factor login** (Settings → Security) is enforced by the database: with 2FA on, a password-only
  session can't read or change anything (`0002_security.sql`).
- **App lock**: locks after a period of no use (and optionally when you leave the app). Unlock with a
  passkey (fingerprint / Face ID / Windows Hello) checked by the server, your 2FA code, or your password.
  5 failed attempts in 15 minutes signs you out.
- **Confirm it's you** before exports, deletes, changing the backup email, moving Telegram reminders,
  removing passkeys or turning 2FA off (unless you confirmed in the last 5 minutes).
- **Security activity** in Settings, plus Telegram alerts for new sign-ins, new passkeys, 2FA changes,
  repeated failed unlocks, and reminders being moved to another chat (the old chat is told).
- **Nothing readable left on the device**: live data stays in memory; signing out clears the page.
- **Strict Content-Security-Policy** with a per-request nonce, no framing, HSTS and other headers.
- `reminder_logs`, passkey writes and challenges are server-only. `/api/cron/reminders` needs the
  `CRON_SECRET` bearer token; `/api/telegram/webhook` needs Telegram's secret header. Both use
  constant-time comparison. The Telegram link code is single-use.
- The service-role key is only used in server code (`server-only` import guard).
- **Receipts** live in a private storage bucket, in a folder per workspace that only its members (with 2FA
  satisfied) can read. The app opens them through links that expire after 5 minutes. Receipt text is
  treated as data: Claude is told to ignore any instructions inside a receipt, and nothing is saved
  until you confirm.

## Known limits

- Custom stack templates and the UI theme are saved in the browser, not in Supabase.
- Live updates cover receipts, payments, services, dates and Telegram settings (`0005_realtime.sql`). Other changes made elsewhere (products, cards, the exchange rate) show up after a reload.
- Vault sync is still a stub that returns sample metadata.
