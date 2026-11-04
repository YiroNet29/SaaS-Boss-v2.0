-- StackTrack schema for Supabase (Postgres).
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- Every table is scoped by workspace_id. Row Level Security (RLS) makes sure a signed-in
-- user can only see and change rows in workspaces they own or are a member of.
-- The cron job and Telegram bot use the service-role key, which bypasses RLS on the server.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.workspaces (
  id                text primary key,
  name              text not null check (char_length(name) between 1 and 120),
  base_currency     text not null default 'USD' check (base_currency in ('USD', 'ETB')),
  timezone          text not null default 'Africa/Nairobi',
  exchange_rates    jsonb not null default '{"ETB_per_USD": 130, "updatedAt": null}'::jsonb,
  default_lead_days integer[] not null default '{30,14,7,1}',
  plan              text not null default 'free' check (plan in ('free', 'pro')),
  vault_base_url    text not null default '',
  owner_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  member_uids       uuid[] not null default '{}',
  created_at        timestamptz not null default now()
);

create table if not exists public.products (
  id            text primary key,
  workspace_id  text not null references public.workspaces (id) on delete cascade,
  name          text not null,
  description   text not null default '',
  status        text not null default 'building'
                check (status in ('idea', 'building', 'live', 'paused', 'retired')),
  live_url      text,
  repo_url      text,
  template_id   text,
  tags          text[] not null default '{}',
  environments  jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

create table if not exists public.service_links (
  id                   text primary key,
  workspace_id         text not null references public.workspaces (id) on delete cascade,
  product_id           text not null references public.products (id) on delete cascade,
  environment_type     text not null default 'production'
                       check (environment_type in ('dev', 'staging', 'production')),
  category             text not null default 'other',
  provider_name        text not null,
  account_email        text not null default '',
  login_url            text not null default '',
  plan                 text not null default '',
  billing_cycle        text not null default 'monthly'
                       check (billing_cycle in ('monthly', 'yearly', 'one-time', 'usage-based', 'free')),
  cost                 numeric(12, 2) not null default 0,
  currency             text not null default 'USD' check (currency in ('USD', 'ETB')),
  start_date           date,
  renewal_date         date,
  trial_ends_at        date,
  auto_renew           boolean not null default true,
  payment_method_label text not null default '',
  notes                text not null default '',
  status               text not null default 'active'
                       check (status in ('active', 'trial', 'paused', 'cancelled')),
  vault_refs           jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz
);

create table if not exists public.important_dates (
  id                     text primary key,
  workspace_id           text not null references public.workspaces (id) on delete cascade,
  product_id             text references public.products (id) on delete cascade,
  service_link_id        text references public.service_links (id) on delete set null,
  type                   text not null default 'custom',
  title                  text not null,
  due_date               date not null,
  recurrence             text not null default 'none'
                         check (recurrence in ('none', 'monthly', 'quarterly', 'yearly', 'custom days')),
  custom_recurrence_days integer,
  lead_days              integer[],
  notes                  text,
  status                 text not null default 'open' check (status in ('open', 'done', 'snoozed')),
  snoozed_until          date,
  source                 text not null default 'manual' check (source in ('manual', 'vault')),
  created_at             timestamptz not null default now(),
  completed_at           timestamptz
);

create table if not exists public.notification_settings (
  workspace_id               text primary key references public.workspaces (id) on delete cascade,
  email                      text not null default '',
  email_enabled              boolean not null default false,
  telegram_chat_id           text not null default '',
  telegram_enabled           boolean not null default false,
  telegram_verification_code text unique,
  digest_time                text not null default '08:00',
  digest_mode                text not null default 'daily' check (digest_mode in ('daily', 'individual'))
);

create table if not exists public.audit_logs (
  id           text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  item_type    text not null,
  item_id      text not null,
  action       text not null,
  changed_by   text not null default '',
  details      text not null default '',
  timestamp    timestamptz not null default now()
);

-- Written only by the server (cron). Members can read it to see what was sent.
create table if not exists public.reminder_logs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces (id) on delete cascade,
  item_type    text not null check (item_type in ('serviceLink', 'importantDate')),
  item_id      text not null,
  channel      text not null check (channel in ('email', 'telegram')),
  lead_day     integer not null,
  sent_at      timestamptz not null default now(),
  status       text not null default 'sent' check (status in ('sent', 'failed', 'skipped'))
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists workspaces_owner_idx        on public.workspaces (owner_id);
create index if not exists workspaces_members_idx      on public.workspaces using gin (member_uids);
create index if not exists products_ws_idx             on public.products (workspace_id);
create index if not exists service_links_ws_idx        on public.service_links (workspace_id, status, renewal_date);
create index if not exists service_links_product_idx   on public.service_links (product_id);
create index if not exists important_dates_ws_idx      on public.important_dates (workspace_id, status, due_date);
create index if not exists audit_logs_ws_idx           on public.audit_logs (workspace_id, timestamp desc);
create index if not exists reminder_logs_lookup_idx    on public.reminder_logs (workspace_id, item_id, channel);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- security definer so the check can read workspaces without recursing into its own policy.
create or replace function public.is_workspace_member(ws_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = ws_id
      and (w.owner_id = auth.uid() or auth.uid() = any (w.member_uids))
  );
$$;

revoke all on function public.is_workspace_member(text) from public;
grant execute on function public.is_workspace_member(text) to authenticated;

alter table public.workspaces            enable row level security;
alter table public.products              enable row level security;
alter table public.service_links         enable row level security;
alter table public.important_dates       enable row level security;
alter table public.notification_settings enable row level security;
alter table public.audit_logs            enable row level security;
alter table public.reminder_logs         enable row level security;

-- Workspaces: members read; only the owner creates, edits or deletes, and can't hand it to someone else.
drop policy if exists ws_select on public.workspaces;
create policy ws_select on public.workspaces for select to authenticated
  using (owner_id = auth.uid() or auth.uid() = any (member_uids));

drop policy if exists ws_insert on public.workspaces;
create policy ws_insert on public.workspaces for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists ws_update on public.workspaces;
create policy ws_update on public.workspaces for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists ws_delete on public.workspaces;
create policy ws_delete on public.workspaces for delete to authenticated
  using (owner_id = auth.uid());

-- Workspace-scoped tables: full access for members, and rows can't be moved into a foreign workspace.
do $$
declare t text;
begin
  foreach t in array array['products', 'service_links', 'important_dates', 'notification_settings', 'audit_logs']
  loop
    execute format('drop policy if exists member_all on public.%I', t);
    execute format(
      'create policy member_all on public.%I for all to authenticated
         using (public.is_workspace_member(workspace_id))
         with check (public.is_workspace_member(workspace_id))', t);
  end loop;
end $$;

-- Reminder logs: read-only for members. No insert/update/delete policy = clients can't write.
drop policy if exists member_read on public.reminder_logs;
create policy member_read on public.reminder_logs for select to authenticated
  using (public.is_workspace_member(workspace_id));
