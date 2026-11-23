# Changelog

What changed, in plain words. Newest first. Add an entry for each merge into `main` (that's what the live
site runs). Commit ids are on branch `local-qa-fixes` until it's merged.

---

## Not live yet: branch `local-qa-fixes` (23 Nov 2026)

Merging this into `main` deploys it. No database changes.

### New
- Three more themes, next to VS Code, Midnight and Warm Light (which look exactly as before):
  **Noir Gold** (green-black and cream, gold accents, serif headings), **Sage** (cream pages, a deep
  forest-green sidebar, terracotta buttons, Plus Jakarta Sans) and **Ember** (warm charcoal, ember-orange
  accents, soft serif headings, crisper corners). Pick one in Settings → Workspace Theme, the theme menu
  in the header, the command palette, or the sidebar button (it now steps through all six). The fonts
  come from this site and only the chosen theme's font is downloaded.
- **Layouts**, separate from themes: Settings → Layout (or the command palette) picks how the pages are
  arranged, and any layout works with any theme. **Classic** is the layout so far. **Timeline** puts the
  menu in one bar across the top (search, theme, Add service and a More menu for Telegram, import and
  export, and sign out) and gives the Dashboard a new page, "What's coming up": this month's cost, the
  next 30 days and anything overdue; the next 60 days as dots on a line (colour = renews by itself, price
  changes with use, renew by hand, or a date to check; items close together share one dot, so labels
  never overlap); the next items as a list; each app's monthly cost; and card top-ups. Everything opens
  its service, app or page. Phones keep the bottom menu.
- **Portfolio**, a third layout (same top bar): the Dashboard shows "3 apps, $… a month" with what's due
  this week as chips, then one column per app: its monthly cost, a budget bar (paid this month against
  the app's budget, as on its page), and its services, each with its price, how it renews and its next
  date. "Add a service to …" under each, an "Add an app" tile, and below, **shared costs**: cards to top
  up or about to expire, and people you owe.
- **A tidier Classic dashboard.** The numbers come first (the four at-a-glance tiles, money alerts and
  the old-rate warning), then three groups: **Coming up** (one box with tabs: Everything due, Renewals,
  Domains, instead of three boxes listing the same dates), **Spending** (the last six months and the next
  twelve side by side, then cost per app and per category) and **Health** (the health check and the
  providers you rely on). The cost summary box is gone: its numbers were already in the tiles and the
  sidebar.

### Fixed
- In Warm Light and Sage, lists with lines between rows (such as the audit log in Settings) showed dark
  navy lines; they now match the theme's borders. (637e471)

### Behind the scenes
- The theme list lives in one place (`src/utils/themes.ts`) with unit tests; every theme picker reads it.
- The readability test now covers all six themes, the Timeline and Portfolio layouts in all six, and
  the Classic dashboard's Coming up tabs.
- The layout list (`src/utils/layouts.ts`), the Timeline's numbers and positions (`src/utils/timeline.ts`)
  and Portfolio's service lines, budget bars and shared costs (`src/utils/portfolio.ts`) have unit tests;
  the Classic dashboard's cost per app uses the same helper.

## Live since 23 Nov 2026: merge `fffd783` (branch `local-qa-fixes`, 7–22 Nov 2026)

Merged into `main` on 23 Nov, after the live site moved to a new Supabase project with migrations
0001–0008 run.

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
- **Security:** any signed-in account could link its workspace to someone else's Telegram chat by writing
  straight to the database; its reminders would then reach that person, and receipts they sent the bot
  could be filed in the wrong workspace. Only the bot can link a chat now (`/start` with the one-time
  code). Needs migration `0008_telegram_link_guard.sql`. Turning off public sign-ups (G12) also closes it.
  (H20)
- Spreadsheet exports: text starting with `=`, `+`, `-` or `@` (such as a vendor name read from someone's
  receipt email) could run as a formula when opened in Excel. It's exported as plain text now. (H20)
- Found in a review of the new features (H22): a budget overrun caused by a renewal due on the last day
  of the month was never alerted (it's recorded on the 1st; the first week of a month now also checks the
  month just ended); the quarterly check had its "Open StackTrack" link twice; `/add … for Built in Public`
  couldn't pick an app with "for" or "in" in its name; `/add Office 365 12 monthly` took 365 as the price;
  a mistyped `/add` with a `<` got no reply; setting a budget before migration 0007 lost the whole app
  save; "Clear filters" on Dates did nothing when every date was done (it now says "Show all dates").
- Escape didn't close most dialogs (app, service and date forms, templates, Import & Export, and others).
  It closes every dialog now, only the top one when two are open, and cancels "Confirm it's you"; the
  lock screen still can't be dismissed. (H24)
- Where a workspace has no exchange rate yet, some pages assumed 130 birr per dollar and others 155. One
  value everywhere now. (H24)
- Screen readers: 32 buttons, links and fields had no name (form labels not connected, filter dropdowns,
  close buttons). All named now, and a test keeps it that way. (H21)
- Quick add: typing in another box (such as the cost) right after the form opened could land in the
  name box, saving "Railway5" for $0. (cd11f1b)

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
- **Faster first screen on a slow connection:** pages other than the Dashboard, the dialogs and the chart
  load separately, so on slow 3G the Dashboard appears after about 8 seconds instead of 11. The rest
  downloads in the background right after, so every page still opens offline. (H23)
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
- 63 browser tests that click through the app against a local database, and GitHub checks on every
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
