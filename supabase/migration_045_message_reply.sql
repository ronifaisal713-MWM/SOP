-- =========================================================
-- MWM Agency OS — Migration 045: Reply to a message
-- Run this in Supabase SQL Editor AFTER migration_044
-- =========================================================
-- Messenger-style replies: a message can point at the one it's
-- answering, and the chat shows a small quoted preview above it.
--
-- ON DELETE SET NULL rather than CASCADE -- deleting the original
-- shouldn't take every reply with it; the reply just loses its quote.

alter table messages add column if not exists reply_to_id uuid references messages(id) on delete set null;

create index if not exists messages_reply_to_idx on messages (reply_to_id);

-- migration_044's trigger pins columns when the SENDER updates their
-- own message, so "delete" can't be repurposed into an edit. reply_to_id
-- belongs in that same locked set.
create or replace function public.enforce_message_self_update_limits()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() = old.sender_id then
    new.visibility := old.visibility;
    new.sender_id := old.sender_id;
    new.recipient_id := old.recipient_id;
    new.client_id := old.client_id;
    new.task_id := old.task_id;
    new.requirement_id := old.requirement_id;
    new.organization_id := old.organization_id;
    new.mentioned_user_id := old.mentioned_user_id;
    new.reply_to_id := old.reply_to_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_message_self_update_limits on messages;
create trigger trg_enforce_message_self_update_limits
before update on messages
for each row execute function public.enforce_message_self_update_limits();
