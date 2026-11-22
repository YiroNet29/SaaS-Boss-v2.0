# Changelog

What changed, in plain words. Newest first. Add an entry for each merge into `main` (that's what the live
site runs). Commit ids are on branch `local-qa-fixes` until it's merged.

---

## Not live yet: branch `local-qa-fixes` (7–22 Nov 2026)

Merging this into `main` deploys it. Run the migrations the Live site check lists as not run (0002–0007),
and 0005 anyway. The newest two only add data for new features (0006: the Status panel; 0007: budgets and
the weekly reminder style); the app works without them.

### Fixed
- "Import to Live" copied only 1 of the 15 demo services. (3c32d21)
- A new account sometimes got two workspaces on its first sign-in. (4f3f54c)
- "Create Workspace" didn't create a workspace. (1d3464f)
- CSV export said "Paid with: Default" for services with no card. (4f3f54c)
- Changes made while offline were lost. Now they wait in the open tab and are saved when the connection
  comes back ("Back online: 2 changes saved"). (5c79a22)
- Unlocking the app always went back to the Dashboard instead of the page you were on. (5c79a22)
- Payments, top-ups and repayments couldn't be deleted; deleting a payment now also sends its receipt
  back to "to review". (e8374cc)
- The receipt form wiped details you had typed when the automatic read finished. (e8374cc)
- Pressing Enter in "Add custom days" dropped the number. (e8374cc)
- Cards & Payments scrolled sideways on phones once payments were listed. (2a53c9b)
- Onboarding gave your first app a hidden description, "Hospital pharmacy and stock replenishment
  SaaS". (ae40726)
- A deleted payment (or receipt, date, service) could reappear until a reload when a live update about it
  arrived late. (H18)
- The light theme had faint or invisible text in many places (white text on light buttons, bright green,
  yellow and pink text on white, a dark Domain expiry box). Every page and main dialog now passes the
  readability minimum in all three themes, and the dark themes' grey text is a little brighter. (I12)
- An empty account's Services and Dates pages said "Nothing matches these filters", and the Health check
  gave it "Grade A+". (I11)

### New
- **Settings → Status:** when the hourly job last ran, the last failed Telegram send and why, the exchange
  rate and the domain/SSL checks. A banner on every page warns when the hourly job has stopped for 3 hours.
  Needs migration `0006_job_status.sql`. (H09–H11)

- **Free trials:** a "Trial ends" date on the service form (it had no box before), reminded on your usual
  reminder days. (I02)
- **Each app's page** shows its cost per year and what was actually paid in the last 12 months. (I06)
- **Price changes:** when a service's last charge differs from its listed price, the Services list says so,
  with a button to use the new price. (I03)
- **Download a month** of payments as a spreadsheet from Cards & Payments → Monthly summary. (I07)
- **Get started** on the Dashboard of a new account: four steps (add an app, its services, the card or
  person that pays, connect Telegram), each with its button, ticked as you go, or hidden with **Hide**.
  Empty pages say what to add first. (I11, I14)
- **Quarterly check:** in the first week of each quarter, Telegram asks "still using these?" with ✅ Keep
  and 🛑 Cancel per service, priciest first. (I04)
- **Monthly budget per app:** set it on the app's form; its page shows this month's payments against it,
  and Telegram tells you at 80% and 100%. Needs migration `0007_budgets_weekly.sql`. (I05)
- **Weekly reminders:** Settings → Messages → "One message on Mondays": overdue, due within 7 days, and
  anything whose reminder day falls that week. Needs migration 0007. (I09)
- **Add a service from Telegram:** `/add Vercel Pro 20 USD monthly for StackTrack`. Without "for …" the
  bot asks which app with buttons. It shows up in the open app straight away. (I08)

### Changed
- "Services" everywhere instead of "Service Links". (c3411e3)
- Plain words across the app instead of the starter project's jargon, and no more claims that it stores
  "credentials" or "secrets" (it never does). (2a06d51)
- Starter templates: "Next.js + Supabase on Vercel" and "Shop or hotel SaaS for Ethiopia", instead of
  Clerk, Stripe, PostHog, Sentry and others you don't use. (3a518ef)
- "Restore the demo data" shows only in demo mode. (2b8ba78)
- New workspaces get no made-up vault address; vault references become links once you set your real
  one in Settings. (c7f53e1)

### Removed
- The Android Studio guide, the FREE plan badge, the fake vault sync and the Telegram simulator: all
  leftovers from the starter project that did nothing real. (56b289f, 661ef40, 79e3741, 25c0c59)
- 98 unused imports and variables. (ae40726)

### Behind the scenes
- Request limits on every API route, so a flood can't run up Claude API costs or hammer other sites. (H12)
- 57 browser tests that click through the app against a local database, and GitHub checks on every
  push: type check, unit tests, package security audit, production build, browser tests, and a backup →
  wipe → restore rehearsal that checks every row comes back. (744c281, 4b87f82, 2c13620, a00ce7a)
- A daily "Live site check" on GitHub: the site answers, its security headers are right, and which
  database migrations have run. (e2149bf)
- The nightly backup now fails (red) when it isn't set up, instead of showing green while making no
  backup. (e2149bf)
- The nightly backup also copies the receipt files (photos and PDFs), encrypted, as a second file. Needs
  one more GitHub secret, `SUPABASE_SERVICE_ROLE_KEY`. GitHub rehearses backing them up and restoring them
  on every push. (H07)
- Weekly pull requests that update packages (Dependabot), once this is on `main`. (2c13620)
- The project checklist (`docs/checklist.json`), a handover document (`docs/HANDOVER.md`) and a startup
  script for Claude cloud sessions. (0e6a874, e40ce8f)

---

## Live (`main`, fc8e8c6, 7 Nov 2026)

Phases 1–5 of `ROADMAP.md`: quick add, dashboard cards, daily exchange rate, encrypted nightly backup
(once its secrets are set), Telegram-first reminders with buttons, security (strict headers, two-factor
login enforced by the database, app lock with passkeys, "Confirm it's you", security log), cards and
payments, the receipt inbox read by Claude, automatic domain and SSL checks, live updates, the monthly
summary, and the local Docker stack.
