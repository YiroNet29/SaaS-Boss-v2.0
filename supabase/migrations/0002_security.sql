-- StackTrack security update (Phase 3). Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run again.
--
-- 1. Two-factor login is enforced by the database: once you have a verified authenticator app,
--    a session that only used the password (AAL1) can't read or change any StackTrack data.
-- 2. Tables for fingerprint / Face ID unlock (passkeys), written only by the server.

-- ---------------------------------------------------------------------------
-- 1. Enforce two-factor login
-- ---------------------------------------------------------------------------

-- True when the session passed 2FA (aal2), or when the user hasn't turned 2FA on.
create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;

revoke all on function public.mfa_satisfied() from public;
grant execute on function public.mfa_satisfied() to authenticated;

-- RESTRICTIVE: must pass in addition to the normal membership policies.
do $$
declare t text;
begin
  foreach t in array array[
    'workspaces', 'products', 'service_links', 'important_dates',
    'notification_settings', 'audit_logs', 'reminder_logs'
  ]
  loop
    execute format('drop policy if exists mfa_required on public.%I', t);
    execute format(
      'create policy mfa_required on public.%I as restrictive for all to authenticated
         using (public.mfa_satisfied())
         with check (public.mfa_satisfied())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Passkeys for the app lock (fingerprint / Face ID / Windows Hello)
-- ---------------------------------------------------------------------------

create table if not exists public.user_passkeys (
  id           text primary key,             -- WebAuthn credential id (base64url)
  user_id      uuid not null references auth.users (id) on delete cascade,
  public_key   text not null,                -- COSE public key (base64url)
  counter      bigint not null default 0,
  transports   text[] not null default '{}',
  device_name  text not null default 'Passkey' check (char_length(device_name) between 1 and 60),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists user_passkeys_user_idx on public.user_passkeys (user_id);

-- One pending challenge per user, valid for a few minutes. Server only.
create table if not exists public.webauthn_challenges (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  challenge  text not null,
  purpose    text not null check (purpose in ('register', 'unlock')),
  expires_at timestamptz not null
);

alter table public.user_passkeys enable row level security;
alter table public.webauthn_challenges enable row level security;

-- You can see your own passkeys (Settings list). Adding, using and removing them goes through the
-- server, which verifies the WebAuthn signatures, so there are no insert/update/delete policies.
drop policy if exists own_read on public.user_passkeys;
create policy own_read on public.user_passkeys for select to authenticated
  using (user_id = auth.uid());

drop policy if exists mfa_required on public.user_passkeys;
create policy mfa_required on public.user_passkeys as restrictive for all to authenticated
  using (public.mfa_satisfied())
  with check (public.mfa_satisfied());
-- webauthn_challenges: RLS on and no policies at all = server (service role) only.
