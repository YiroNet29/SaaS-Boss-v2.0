# StackTrack Roadmap

**Goal:** one place for a solo founder running several SaaS apps to see what each app pays for,
what it costs in USD and ETB, and when anything renews or expires (subscriptions, domains, SSL,
API keys), with reminders on Telegram before deadlines. Secrets stay in the separate vault app.

**Decisions (Nov 2026)**
- Single user (the owner). No billing, teams or pricing tiers.
- Telegram is the main reminder channel; email is the backup.
- Payments come from two sources: a friend in the USA, and the owner's virtual cards.
- Receipts (emailed and paper) should be captured and read automatically.
- The vault stays a separate app; StackTrack adopts its security ideas (done properly).

---

## Phase 0: Owner setup (no code)
- [ ] Supabase → Authentication → URL Configuration: Site URL `https://saas-boss-v20.vercel.app`,
      Redirect URL `https://saas-boss-v20.vercel.app/auth/callback`
- [ ] Supabase → Authentication → turn **off** "Allow new users to sign up" (after your account exists)
- [ ] Supabase → SQL Editor: run `supabase/migrations/0002_security.sql` (before turning on 2FA)
- [ ] Vercel env: `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, then redeploy
- [ ] cron-job.org: hourly `GET /api/cron/reminders` with `Authorization: Bearer <CRON_SECRET>`
- [ ] Telegram: create the bot with @BotFather, set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` in Vercel,
      redeploy, then Settings → Telegram reminders → Set up bot → Connect Telegram
- [ ] Consider making the GitHub repo **private** (Settings → General → Danger zone)
- [ ] Backups: add GitHub secrets `SUPABASE_DB_URL` (Session pooler string) and `BACKUP_PASSPHRASE`,
      then Actions → Nightly database backup → Run workflow (see README → Backups)

---

## Phase 1: Core fixes and quick wins ✅ (done Nov 5, 2026)

### 1.1 Auto-renewing services roll forward (bug) ✅
**Problem:** a service set to auto-renew keeps its old renewal date forever. After that date it shows
"Overdue", forecasts are wrong, and the reminder job sends overdue alerts for something already paid.

**How it works**
- New helper `nextRenewalDate(date, cycle, today, anchorDay?)`: moves a date forward by whole billing
  cycles until it is today or later. Monthly and usage-based add 1 month, yearly adds 1 year.
  One-time and free services are never moved.
- Month-end safe: a service that renews on the 31st renews on Feb 28/29, then back on Mar 31
  (the day comes from the start date when there is one, otherwise from the renewal date).
- Applied in two places so it's right even if the app isn't opened:
  1. the hourly cron job, before it decides what to remind about (writes to the database);
  2. the app, when it loads your data (instant view, saved to Supabase).
- Each move writes an audit entry: "Auto-renewed Vercel: Nov 7 → Dec 7".
- Only `active` services with `autoRenew` on are moved. Trials, paused and cancelled are untouched.

**Done when:** an auto-renewing service never shows "Overdue"; unit tests cover month ends, leap years,
multi-cycle jumps and the skipped cycles.

### 1.2 Quick Add Service ✅
**Problem:** the full service form has ~15 fields and it isn't obvious where the price goes.

**How it works**
- "Quick add" opens a small form: **Service name** (suggestions like Vercel, Supabase, Namecheap),
  **Cost + currency**, **Monthly / Yearly**, **Next renewal date**, **App** (optional).
- Category is guessed from the name (Vercel → Hosting, Namecheap → Domain registrar) and can be changed.
- If you have no apps yet, the service goes into an automatically created app called "My Stack".
- "More options…" opens the full form with everything already filled in.
- Reachable from the header, the + button and the keyboard shortcut.

**Done when:** a service can be added in under 15 seconds, and it saves and survives a reload.

### 1.3 Dashboard summary cards ✅
A row of 4 cards at the very top of the dashboard:
| Card | Shows | Click goes to |
|---|---|---|
| Monthly cost | total per month in USD and ETB (yearly plans ÷ 12) | Services |
| Renewals, next 30 days | count + total amount, nearest one | Due dates |
| Domains expiring, next 60 days | count + nearest domain | Due dates |
| Overdue | count of overdue dates and non-auto-renew services | Due dates |

**Done when:** the numbers match the service list and update right after an edit.

### 1.4 Clearer wording ✅
- Product form: "An **app you own**, e.g. SaaS Boss. Add what it pays for as Services."
- Service form: "Something an app **pays for**, e.g. Vercel hosting. The price goes here."
- Better empty states on the Products and Services pages.
- Remove the "5 free products" labels (single user, nothing was enforced anyway).

### 1.5 Daily automatic exchange rate ✅
**Problem:** the default rate is 130 ETB/USD; the real rate is ~155–161 and moves ~20% a year.

**How it works**
- The cron job fetches the USD→ETB rate once a day from a free public rates API and updates
  workspaces in **Auto** mode.
- Settings gets an **Auto / Manual** switch. Manual keeps your own number (for example the rate your
  virtual card provider really charges).
- Settings shows where the rate came from and when it was updated. If fetching fails, the last rate stays.

### 1.6 "Send test reminder" button ✅
- Settings → Notifications → **Send test**. Sends a sample message to your Telegram and/or email right away
  and shows "Sent ✓" or the exact error (e.g. "RESEND_API_KEY is not set").
- Server route checks you're signed in and own the workspace. No cron-job.org needed to test.

### 1.7 Encrypted nightly database backup ✅
- GitHub Action runs every night: dumps the Supabase database, **encrypts it with your passphrase**,
  stores it as a downloadable file for 30 days. Encryption matters because the repo is public.
- You add two GitHub secrets: `SUPABASE_DB_URL` (Session pooler connection string, includes the DB
  password) and `BACKUP_PASSPHRASE`. Neither is ever shared in chat.
- README explains how to decrypt and restore.

---

## Phase 2: Telegram-first ✅ (done Nov 5, 2026)

### 2.1 Set up the bot from the app (no curl) ✅
- Settings → Telegram shows a checklist: **bot token found**, **webhook connected**, **chat linked**.
- **Set up bot** button: the server registers the webhook with its secret, sets the command menu
  (/due, /week, /help) and reads the bot's username, so `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` is no longer needed.
- Shows Telegram's last delivery error if there is one.

### 2.2 Telegram first, email as backup ✅
- Reminders go to Telegram. Email is sent **only** when Telegram isn't linked, is switched off, or the send fails.
- An item counts as reminded once it reached you on either channel, so you never get the same reminder twice.

### 2.3 Clearer reminder message ✅
- Grouped: ⚠️ Overdue, 📅 Coming up. Each line: name, app, when, amount in USD **and** ETB.
- Footer: total due this week in USD and ETB, link to the app.

### 2.4 Buttons inside reminders ✅
- Important dates: **✅ Done** (recurring ones schedule the next one), **😴 3d**, **😴 7d**.
- Manual-renewal services: **✅ Paid** (moves the renewal date to the next cycle).
- Auto-renewing services: no button needed; they roll forward by themselves.
- After a tap the button turns into "✔ Done: …", and the change shows in the app.
- Safety: only works in your private chat that's linked to the workspace that owns the item.

### 2.5 Bot commands ✅
- /due and /week come with the same buttons. /help lists commands. Group chats are ignored.

### 2.6 Snooze fix ✅
- Snoozing an overdue item now counts from **today** (it used to count from the old due date, so it stayed overdue).

### 2.7 Settings layout ✅
- Telegram card first (main channel), then "Email backup", then digest time. The fake Telegram simulator is
  hidden in the live workspace (still in the demo).

## Phase 3: Security (ideas from the vault, done properly) ✅ (done Nov 5, 2026)

What we deliberately **don't** copy from the vault: unlocking that falls through when the fingerprint
prompt is cancelled, a PIN that protects the master password on the device, a fast-hash password check.
Every unlock here is verified by the server.

### 3.1 Browser security headers ✅
- Strict Content-Security-Policy with a fresh nonce per page load: only this app's own scripts can run,
  the page can only talk to itself and your Supabase project, and it can't be framed by other sites.
- Plus `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS.

### 3.2 No readable data left on the device ✅
- Live workspace data is kept in memory only (no copy in browser storage). Old copies are wiped.
- Signing out clears everything from the page. (Trade-off: the live workspace needs internet to open.)

### 3.3 Two-factor login (authenticator app) ✅
- Settings → Security → turn on 2FA: scan a QR code with Google Authenticator / Authy / 1Password, enter a code.
- After your password, the app asks for the 6-digit code.
- **Enforced by the database**, not just the screen: once 2FA is on, data can't be read or changed with a
  password-only session (new SQL file to run once).
- Lost phone: add a second authenticator device, or remove 2FA from the Supabase dashboard (README).

### 3.4 App lock ✅
- Locks after a period of no use (default 15 min) and, optionally, whenever you leave the app.
- Unlock with **fingerprint / Face ID / Windows Hello** (a passkey checked by the server), or your
  authenticator code (if 2FA is on), or your password (if it isn't).
- 5 wrong attempts in 15 minutes → signed out.

### 3.5 Confirm before risky actions ✅
- Exports (CSV, backup, calendar), deletes, changing where reminders go, turning 2FA off ask you to unlock
  again unless you did so in the last 5 minutes.

### 3.6 Security log and alerts ✅
- Settings shows recent security events: sign-ins, unlocks and failed unlocks, exports, 2FA and passkey changes.
- Telegram alert for a new sign-in, 2FA turned off, a new passkey, and when reminders are moved to a
  different Telegram chat (the old chat gets told).

## Phase 4: Payments and receipts

**Defaults chosen (change any time):** your friend's balance is a running total in USD with a
**Settle up** button (repay in USD or ETB, per payment or monthly); receipts are read by **Claude**
(without an API key they're still saved for manual entry); email receipts can be **forwarded to the
Telegram bot** (no domain needed), with optional Cloudflare email forwarding later.

### Part A: money (no AI)

#### 4.1 "Paid with": cards and people
- New **Cards & Payments** page. Add a payment source: a **card** (virtual dollar card, bank card) with
  currency, last 4 digits, expiry and optional prepaid balance, or a **person** (your friend in the USA).
- Each service gets a **Paid with** choice instead of the free-text payment label.

#### 4.2 Payment history
- Every renewal becomes a payment record: date, amount, currency, which card/person paid, and
  optionally **what it really cost you in birr** (with card fees).
- Created automatically: auto-renewals when they roll forward, **✅ Paid** in Telegram, **Mark paid** in
  the app. Each renewal cycle can only be recorded once (no duplicates).
- Service details show its **price history**.

#### 4.3 Balances
- Prepaid cards: opening balance + **top-ups** − charges = current balance.
- Your friend: payments they made − your **repayments** = what you owe ("You owe Abebe $45").

#### 4.4 Top-up planner and alerts
- For each prepaid card: charges coming in the next 30 days vs its balance →
  "**Top up $85 (≈ ETB 13,380) before Nov 12**".
- Card expiry warnings (cards expiring within 45 days, with the services they pay).
- Telegram: top-up reminders 7, 3 and 1 days before a card would run short; card expiry warning;
  "you owe" summary on the 1st of each month.

### Part B: receipts

#### 4.5 Receipt inbox
- Send a **photo, PDF or forwarded email text** to the Telegram bot, or upload in the app.
- Files are stored privately in Supabase Storage (only you can open them).
- Claude reads vendor, amount, currency, date and card; the bot replies with a suggested match
  ("Vercel $20 on Nov 5?") and buttons **✅ Save** / **Edit in app** / **Ignore**.
- The app's **Receipts** inbox lets you review, correct, match to a service and confirm; confirming
  records the payment (or attaches the receipt to the existing one).
- Optional: Cloudflare Email Routing → receipts by email.

## Phase 5: Automation
Domain expiry lookup (RDAP; `.et` stays manual with earlier reminders); SSL certificate expiry check.

## Phase 6: Vault link
Fix the vault's security holes in its own repo, then sync key-rotation dates into StackTrack.
