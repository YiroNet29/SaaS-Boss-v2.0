-- StackTrack: automatic domain (RDAP) and SSL certificate expiry checks (Phase 5).
-- Safe to re-run.

alter table public.important_dates add column if not exists check_target text;            -- domain or host[:port]
alter table public.important_dates add column if not exists auto_check boolean not null default false;
alter table public.important_dates add column if not exists last_checked_at timestamptz;
alter table public.important_dates add column if not exists last_check jsonb;               -- what the last check found

alter table public.important_dates drop constraint if exists important_dates_check_target_check;
alter table public.important_dates add constraint important_dates_check_target_check
  check (check_target is null or (char_length(check_target) between 3 and 260 and check_target ~ '^[a-z0-9.:-]+$'));

-- The reminder job picks the dates that are due for a check.
create index if not exists important_dates_auto_check_idx
  on public.important_dates (last_checked_at nulls first) where auto_check;
