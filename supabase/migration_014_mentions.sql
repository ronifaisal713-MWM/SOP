-- =========================================================
-- MWM Agency OS — Migration 014: @Mentions with acknowledgment
-- Run this in Supabase SQL Editor AFTER migration_013
-- =========================================================
-- A message can mention ONE specific person. Until that person taps
-- the acknowledge (✓) button, the message shows in red for them --
-- this is tracked with a plain boolean, not just parsed from text, so
-- it survives edits/reloads and can't be faked by the UI alone.

alter table messages add column if not exists mentioned_user_id uuid references auth.users(id);
alter table messages add column if not exists mention_acknowledged boolean not null default false;

-- Only the mentioned person can acknowledge their own mention -- and
-- the trigger below stops them (or anyone) from changing anything else
-- on the row through this path, RLS alone only controls which ROWS are
-- reachable, not which COLUMNS within them.
create policy "mentioned_user_can_acknowledge" on messages
  for update
  using (mentioned_user_id = auth.uid())
  with check (mentioned_user_id = auth.uid());

create or replace function public.enforce_mention_ack_only()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() = old.mentioned_user_id then
    -- Only mention_acknowledged is allowed to change via this path;
    -- silently keep every other column at its previous value.
    new.body := old.body;
    new.visibility := old.visibility;
    new.attachment_id := old.attachment_id;
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

drop trigger if exists trg_enforce_mention_ack_only on messages;
create trigger trg_enforce_mention_ack_only
before update on messages
for each row execute function public.enforce_mention_ack_only();

-- Extend the existing notification trigger so a mention also creates a
-- dedicated "You were mentioned" notification, on top of whatever
-- normal new-message notification already fires.
create or replace function public.notify_on_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link text;
begin
  if new.mentioned_user_id is null or new.mentioned_user_id = new.sender_id then
    return new;
  end if;

  if new.task_id is not null then
    v_link := '/dashboard/tasks/' || new.task_id;
  elsif new.client_id is not null then
    v_link := '/dashboard/clients/' || new.client_id || '?openChat=1&tab=' || new.visibility;
  else
    v_link := '/dashboard';
  end if;

  insert into notifications (user_id, title, body, link)
  values (new.mentioned_user_id, 'You were mentioned', left(coalesce(new.body, ''), 100), v_link);

  return new;
end;
$$;

drop trigger if exists trg_notify_on_mention on messages;
create trigger trg_notify_on_mention
after insert on messages
for each row execute function public.notify_on_mention();
