-- StackTrack payments & receipts (Phase 4). Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Needs 0001_init.sql and 0002_security.sql first. Safe to run again.

-- ---------------------------------------------------------------------------
-- Payment sources: cards (virtual / bank) and people (a friend who pays for you)
-- ---------------------------------------------------------------------------
create table if not exists public.payment_sources (
  id              text primary key,
  workspace_id    text not null references public.workspaces (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 60),
  kind            text not null check (kind in ('card', 'person', 'bank', 'other')),
  currency        text not null default 'USD' check (currency in ('USD', 'ETB')),
  prepaid         boolean not null default false,          -- has a balance you top up
  opening_balance numeric(12, 2) not null default 0,
  low_balance     numeric(12, 2),                          -- warn below this
  last4           text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  expires_on      date,                                    -- card expiry (last day of that month)
  notes           text not null default '',
  archived        boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists payment_sources_ws_idx on public.payment_sources (workspace_id);

alter table public.service_links
  add column if not exists payment_source_id text references public.payment_sources (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Payments: one row per renewal actually paid
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id              text primary key,                        -- pay-<service>-<yyyymmdd> for renewals (no duplicates)
  workspace_id    text not null references public.workspaces (id) on delete cascade,
  service_link_id text references public.service_links (id) on delete set null,
  source_id       text references public.payment_sources (id) on delete set null,
  paid_on         date not null,
  amount          numeric(12, 2) not null check (amount >= 0),
  currency        text not null check (currency in ('USD', 'ETB')),
  etb_paid        numeric(14, 2) check (etb_paid is null or etb_paid >= 0), -- what it really cost in birr
  origin          text not null default 'manual' check (origin in ('manual', 'auto_renew', 'telegram', 'receipt')),
  receipt_id      text,
  note            text not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists payments_ws_idx on public.payments (workspace_id, paid_on desc);
create index if not exists payments_service_idx on public.payments (service_link_id);
create index if not exists payments_source_idx on public.payments (source_id);

-- Top-ups of prepaid cards, repayments to a person, manual corrections.
create table if not exists public.source_transactions (
  id           text primary key,
  workspace_id text not null references public.workspaces (id) on delete cascade,
  source_id    text not null references public.payment_sources (id) on delete cascade,
  kind         text not null check (kind in ('top_up', 'repayment', 'adjustment')),
  happened_on  date not null,
  amount       numeric(12, 2) not null,                     -- in the source's currency (adjustments may be negative)
  etb_paid     numeric(14, 2) check (etb_paid is null or etb_paid >= 0),
  note         text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists source_tx_source_idx on public.source_transactions (source_id, happened_on);

-- ---------------------------------------------------------------------------
-- Receipts inbox
-- ---------------------------------------------------------------------------
create table if not exists public.receipts (
  id                  text primary key,
  workspace_id        text not null references public.workspaces (id) on delete cascade,
  channel             text not null check (channel in ('telegram', 'upload', 'email')),
  storage_path        text,                                  -- <workspace_id>/<receipt id>.<ext> in the "receipts" bucket
  mime_type           text,
  original_name       text,
  size_bytes          integer,
  text_content        text,                                  -- forwarded email / message text
  status              text not null default 'new'
                      check (status in ('new', 'reading', 'needs_review', 'confirmed', 'ignored', 'failed')),
  extracted           jsonb not null default '{}'::jsonb,
  service_link_id     text references public.service_links (id) on delete set null,
  payment_id          text references public.payments (id) on delete set null,
  telegram_chat_id    text,
  telegram_message_id bigint,
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz
);
create index if not exists receipts_ws_idx on public.receipts (workspace_id, created_at desc);

do $$ begin
  alter table public.payments
    add constraint payments_receipt_fk foreign key (receipt_id) references public.receipts (id) on delete set null;
exception when duplicate_object then null; end $$;

-- Reminder log also covers money alerts (top-ups, card expiry, monthly "you owe").
alter table public.reminder_logs drop constraint if exists reminder_logs_item_type_check;
alter table public.reminder_logs add constraint reminder_logs_item_type_check
  check (item_type in ('serviceLink', 'importantDate', 'paymentSource', 'workspace'));

-- ---------------------------------------------------------------------------
-- Row Level Security: members only, and 2FA enforced like every other table
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['payment_sources', 'payments', 'source_transactions', 'receipts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists member_all on public.%I', t);
    execute format(
      'create policy member_all on public.%I for all to authenticated
         using (public.is_workspace_member(workspace_id))
         with check (public.is_workspace_member(workspace_id))', t);
    execute format('drop policy if exists mfa_required on public.%I', t);
    execute format(
      'create policy mfa_required on public.%I as restrictive for all to authenticated
         using (public.mfa_satisfied())
         with check (public.mfa_satisfied())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Private storage for receipt files: receipts/<workspace_id>/<file>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf', 'text/plain'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists receipts_member_read on storage.objects;
create policy receipts_member_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_workspace_member((storage.foldername(name))[1]) and public.mfa_satisfied());

drop policy if exists receipts_member_insert on storage.objects;
create policy receipts_member_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.is_workspace_member((storage.foldername(name))[1]) and public.mfa_satisfied());

drop policy if exists receipts_member_delete on storage.objects;
create policy receipts_member_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.is_workspace_member((storage.foldername(name))[1]) and public.mfa_satisfied());
