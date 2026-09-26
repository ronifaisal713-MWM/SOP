-- =========================================================
-- MWM Agency OS — Migration 041: Guard against self-notifications
-- Run this in Supabase SQL Editor AFTER migration_040
-- =========================================================
-- Belt-and-braces fix for "I get a push for my own message".
--
-- Each notification-creating function already excludes the actor, but
-- notify_on_new_message has been redefined by four separate migrations
-- (008, 010, 030, 039) -- so whichever ran LAST in a given database is
-- what's actually live. If an older one won, the sender gets a row and
-- therefore a push.
--
-- Rather than depending on migration order being perfect, this blocks
-- the case centrally: a BEFORE INSERT trigger on notifications drops
-- any row whose recipient is the person who caused it. Nothing
-- downstream (including push) can then deliver it, no matter which
-- function created it.

create or replace function public.block_self_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is the person whose action triggered this. It can be
  -- null inside SECURITY DEFINER contexts, in which case we let the
  -- row through -- a redundant notification is better than a missing
  -- one.
  if auth.uid() is not null and new.user_id = auth.uid() then
    return null;  -- drop the row silently
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_self_notification on notifications;
create trigger trg_block_self_notification
before insert on notifications
for each row execute function public.block_self_notification();
