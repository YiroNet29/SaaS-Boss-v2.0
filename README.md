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
- **Telegram bot:** `/start <code>`, `/due`, `/week`, `/snooze <id> <days>`, `/stop`.
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
```

---

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the values (see below)
npm run dev                  # http://localhost:3000
```

Without Supabase values the app still runs in **demo mode**.

```bash
npm test        # unit tests (node:test)
npm run lint    # type-check
npm run build   # production build
```

---

## Setup guide

### 1. Supabase (database + login)

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**: paste the whole of `supabase/migrations/0001_init.sql`, click **Run**. Then do the same with `supabase/migrations/0002_security.sql` (two-factor enforcement and passkeys). Both are safe to re-run.
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
is switched off, or can't be reached. Bot commands: `/due`, `/week`, `/help`, `/stop`. The bot ignores
group chats and only acts on items in workspaces linked to your chat.

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

Restore into a **new, empty** Supabase project (or drop the StackTrack tables first). Sign up in the
app once on the new project, then point your data at your new user id in the SQL Editor:
`update workspaces set owner_id = (select id from auth.users limit 1);`

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

## Known limits

- Custom stack templates and the UI theme are saved in the browser, not in Supabase.
- Data loads when you sign in or switch workspace. Changes made in another tab or by the Telegram bot show up after a reload (no realtime subscription yet).
- Vault sync is still a stub that returns sample metadata.
