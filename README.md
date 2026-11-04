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
2. **SQL Editor → New query**, paste the whole of `supabase/migrations/0001_init.sql`, click **Run**. It is safe to re-run.
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

### 5. Telegram bot (optional)

1. Talk to [@BotFather](https://t.me/BotFather) → `/newbot`. Copy the token → `TELEGRAM_BOT_TOKEN`, and the bot username → `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`.
2. Pick any random string for `TELEGRAM_WEBHOOK_SECRET`, redeploy, then register the webhook once:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<your-app>/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

3. In the app: **Settings → Telegram Bot → Connect Telegram**. This opens the bot with your link code; press **Start**.

---

## Security notes

- Row Level Security on every table. Members get full access to their own workspace's rows and nothing else. Only the owner can edit or delete a workspace, and ownership can't be reassigned from the client.
- `reminder_logs` is read-only for users. Only the server job (service-role key) writes to it.
- `/api/cron/reminders` requires `Authorization: Bearer <CRON_SECRET>`, and `/api/telegram/webhook` requires Telegram's `X-Telegram-Bot-Api-Secret-Token` header. Both are compared in constant time.
- The service-role key is only used in server route handlers (`server-only` import guard).

## Known limits

- Custom stack templates and the UI theme are saved in the browser, not in Supabase.
- Data loads when you sign in or switch workspace. Changes made in another tab or by the Telegram bot show up after a reload (no realtime subscription yet).
- Vault sync is still a stub that returns sample metadata.
