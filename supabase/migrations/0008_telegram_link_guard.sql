-- Only the server links a Telegram chat: when you send /start with your one-time code from that chat
-- (and /stop unlinks it). Before this, any signed-in account could write telegram_chat_id on its own
-- settings row, so a stranger who signed up could point their workspace at your chat: their reminders
-- would reach you, and receipts you send the bot could be filed in their workspace.
-- From now on a browser write leaves the linked chat as it is (a new row starts unlinked).
-- The server (service role) and the SQL Editor are not affected. Safe to run more than once.
create or replace function public.keep_telegram_chat_server_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.telegram_chat_id := '';
    else
      new.telegram_chat_id := old.telegram_chat_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists telegram_chat_server_only on public.notification_settings;
create trigger telegram_chat_server_only
  before insert or update on public.notification_settings
  for each row execute function public.keep_telegram_chat_server_only();
