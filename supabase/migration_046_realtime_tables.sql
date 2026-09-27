-- =========================================================
-- MWM Agency OS — Migration 046: Enable realtime on newer tables
-- Run this in Supabase SQL Editor AFTER migration_045
-- =========================================================
-- Supabase only broadcasts postgres_changes for tables explicitly
-- added to the supabase_realtime publication. `messages` and
-- `notifications` were added back in migrations 006 and 008, but the
-- tables added since never were -- so their .on("postgres_changes")
-- subscriptions silently received nothing.
--
-- This is why a reaction didn't appear until the chat was reopened,
-- and why the Task Board's "working now" indicator didn't update live.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table message_reactions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'time_entries'
  ) then
    alter publication supabase_realtime add table time_entries;
  end if;
end $$;
