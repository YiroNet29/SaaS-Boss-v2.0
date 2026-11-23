-- 1. A monthly budget per app, in USD (empty = no budget). The hourly job sends a Telegram alert when
--    what was paid for the app this month reaches 80% and 100% of it.
-- 2. "weekly" as a third reminder style: one message on Monday with the week ahead, instead of daily ones.
-- The app works without this migration; budgets and the weekly style just can't be saved until it's run.
-- Safe to run more than once.
alter table public.products
  add column if not exists monthly_budget numeric(12, 2)
  check (monthly_budget is null or monthly_budget > 0);

alter table public.notification_settings drop constraint if exists notification_settings_digest_mode_check;
alter table public.notification_settings add constraint notification_settings_digest_mode_check
  check (digest_mode in ('daily', 'individual', 'weekly'));
