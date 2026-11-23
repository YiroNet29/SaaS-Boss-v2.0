-- What the hourly job last did, per workspace: when it ran, any error, and the last failed Telegram send.
-- Written by the server (cron); shown in Settings → Status, and a banner warns when the job stops.
-- Safe to run more than once.
alter table public.workspaces
  add column if not exists job_status jsonb not null default '{}'::jsonb;
