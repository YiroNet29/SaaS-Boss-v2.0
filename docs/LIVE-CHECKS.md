# Checking StackTrack on the real site

The checklist's phase L ("Check it on the real site"), step by step. Do them after the deploy, in any
order; each takes a few minutes. When one doesn't match what's written here, tell Claude the task id
(for example "L05") and what you saw. A screenshot helps. **Never paste a key, password or code** into
the chat.

## Before you start

These must be done first (phase G on the checklist):

- **G16:** the Supabase project is running again.
- **G02–G05, G17–G19:** the migrations are run.
- **G06, G07:** the Vercel settings are in, and `local-qa-fixes` is merged, so the site runs the new
  version.
- **G08:** the hourly job.
- **G09–G10:** Telegram is connected.
- **G11:** two-factor login is on (L01 needs it).

The live site is https://saas-boss-v20.vercel.app.

---

### L01: Sign in with password and 2FA code
1. Turn on two-factor login (G11), if it isn't already: **Workspace Settings → Two-factor login → Turn
   on**. Scan the code with your authenticator app, then type the 6-digit code it shows.
2. **Sign out** (top of the sidebar, next to your email).
3. Sign in with your email and password.

**You should see** a request for the 6-digit code. A wrong code is refused. With the right one, your apps
and services appear.

### L02: Lock and unlock with a passkey (on your phone)
1. On the phone, open the site and sign in.
2. **Workspace Settings → App lock → Add fingerprint / Face ID on this device**, and confirm with your
   fingerprint or face.
3. Set **Lock after** to 5 minutes, then press **Lock now**.
4. Press **Unlock with fingerprint / Face ID**.

**You should see** the app open again on the page you were on. Leave it untouched for 5 minutes and it
locks by itself.

### L03: The hourly job succeeds
1. On cron-job.org, open the StackTrack job → **History**.
2. In StackTrack: **Workspace Settings → Status**.

**You should see** a 200 for every hour since you set it up. Status should say the hourly job ran less
than an hour ago, with no red warning banner at the top of the page.

### L04: A test reminder reaches Telegram
1. **Workspace Settings → Test your reminders → Send test**.

**You should see** a "Test reminder" from your bot within a few seconds, with buttons under it.

### L05: Mark a reminder paid from Telegram
1. Pick a service that does **not** renew automatically and is due within 30 days. Or make a test one:
   **Add Service**, a small cost, next renewal tomorrow, auto-renew off.
2. Open **Cards & Payments** in the app and leave it open.
3. In Telegram send `/due`, then tap **✅ Paid** under that service.

**You should see** the button change to "✔ Paid · next …". Without reloading, the payment appears in Cards &
Payments, and the service's renewal date moves to the next period. If you made a test service, delete it
afterwards.

### L06: Send a receipt photo to the bot
1. Take a photo of a receipt (or send a PDF) to the bot.

**You should see** a reply with what it read: vendor, amount, date, and the service it matched. Tap
**✅ Save**, then find the receipt in **Receipts**, with the payment in Cards & Payments.

Reading photos needs the Claude API key (G14). Without it, the bot still saves the photo and asks you to
fill in the details in the app.

### L07: Paste an emailed receipt to the bot
1. Forward a billing email to the bot, or copy its text and paste it in.

**You should see** the vendor, amount and date read correctly, checked against the email. Tap **✅ Save**.

### L08: /due and /month in Telegram
1. Send `/due`, then `/month`.

**You should see** `/due` list what's overdue and due in the next 30 days, with buttons. `/month` shows
last month's spending in USD and birr.

### L09: One real domain's expiry
1. **Due Dates & Calendar → Add Date**, type **Domain expiry**.
2. Fill in **Domain to check** with a domain you own, for example `yourdomain.com`.
3. Save, then press **Check now** on that date.
4. Look up the same domain's expiry at your registrar.

**You should see** the same expiry date in both. Some country domains (such as `.et`) publish no expiry
date. The app then shows "No automatic lookup" under the date; keep that date by hand.

### L10: One real site's SSL date
1. Same as L09, with the type **SSL expiry** and **Website to check** = the site, for example
   `saas-boss-v20.vercel.app`.
2. In the browser, click the padlock → certificate → **Expires on**.

**You should see** the two dates match. Vercel renews certificates by itself, so a date about 2–3 months
ahead is normal.

### L11: Changes sync between two devices
1. Sign in on the laptop and on the phone.
2. On the laptop, change a service's cost.

**You should see** the new cost on the phone within a few seconds, without reloading.

### L12: The exchange rate updates daily
1. **Workspace Settings → Currency & Exchange Rates**: note the ETB per 1 USD and its date.
2. Look again the next day.

**You should see** today's date, and usually a slightly different rate. In **manual** mode it doesn't
change: switch to **auto**.

### L13: The first nightly backup
1. GitHub → this repository → **Actions → Nightly database backup**.

**You should see** last night's run green, with two files: `stacktrack-db-backup-…` and
`stacktrack-receipts-backup-…`. Red means a secret is missing (G13): the run's page says which one.

### L14: Practise restoring a backup once
Follow **README → Backups → Restore** into a copy, never into the live project. Use either a new free
Supabase project or the local Docker stack on your computer. Claude can do this with you. The point is
to know the passphrase works and the steps make sense before you ever need them.

**You should see** your apps, services and receipts in the copy.

### L15: Sign-in alerts and the security log
1. Sign in from a browser or device you haven't used before, for example a private window.
2. Then open **Workspace Settings → Security activity**.

**You should see** the new sign-in at the top of the list. Telegram gets an alert about it within a
minute.

### L16: Phone layout on the live site
1. On the phone, open the **Dashboard**, **Cards & Payments** and **Receipts**.

**You should see** every page fit the screen. Nothing should need scrolling sideways, and the bottom menu
should always be visible.
