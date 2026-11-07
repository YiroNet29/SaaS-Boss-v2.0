-- StackTrack: live updates in the open app (Supabase Realtime).
-- Changes made by the Telegram bot and the hourly job (receipts, payments, renewals, dates) show up
-- without a reload. Realtime applies the same Row Level Security as every query, so a browser only
-- receives rows it could read (its own workspaces, with 2FA satisfied). Safe to re-run.
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['receipts', 'payments', 'important_dates', 'service_links', 'notification_settings']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
