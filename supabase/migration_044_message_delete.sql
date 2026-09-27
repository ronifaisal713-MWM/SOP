-- =========================================================
-- MWM Agency OS — Migration 044: Delete your own messages
-- Run this in Supabase SQL Editor AFTER migration_043
-- =========================================================
-- Soft delete: the row stays so the conversation doesn't develop
-- confusing gaps, but the body and attachment are cleared and it
-- renders as "This message was deleted". Only the sender can delete
-- their own message -- an agency owner deleting someone else's would
-- undermine the audit trail the rest of the app maintains.

alter table messages add column if not exists deleted_at timestamptz;

-- The existing update policy on messages is the narrow
-- mention-acknowledge one (migration_014), which locks every other
-- column. Deleting needs its own path.
create policy "sender_can_delete_own_message" on messages
  for update
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

-- migration_014's trigger pins every column when the person updating
-- is the mentioned user. Extend the same idea: when the SENDER is
-- updating, only deleted_at / body / attachment_id may change, so this
-- path can't be used to rewrite history.
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
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_message_self_update_limits on messages;
create trigger trg_enforce_message_self_update_limits
before update on messages
for each row execute function public.enforce_message_self_update_limits();
