-- =========================================================
-- MWM Agency OS — Migration 047: Realtime for collaborative tables
-- Run this in Supabase SQL Editor AFTER migration_046
-- =========================================================
-- Supabase only broadcasts changes for tables in the
-- supabase_realtime publication. These are the ones where two people
-- genuinely work at the same time and a stale screen causes real
-- confusion:
--
--   tasks                -- someone moves a card while you're looking
--                           at the board
--   task_checklist_items -- two people ticking off the same checklist
--   task_assignees       -- being assigned (or unassigned) mid-session
--   files                -- a document appearing on a shared record
--   requirements         -- a new one arriving, or one being edited
--
-- Deliberately left out: monthly_reports, invoices, push_subscriptions,
-- activity_log. Those are either written rarely, by one person at a
-- time, or never displayed live -- subscribing to them would cost
-- connections without changing what anyone sees.

do $$
declare
  t text;
begin
  foreach t in array array[
    'tasks',
    'task_checklist_items',
    'task_assignees',
    'files',
    'requirements'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
