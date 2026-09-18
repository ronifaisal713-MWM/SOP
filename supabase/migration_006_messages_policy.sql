-- =========================================================
-- MWM Agency OS — Migration 006: Messages access policy
-- Run this in Supabase SQL Editor AFTER migration_005
-- =========================================================

-- Same RLS-enabled-but-no-policy gap as requirements/tasks had.
-- Rules:
--   - Staff can read and send ANY message (client-visible or internal).
--   - Clients can only read/send messages marked visibility = 'client',
--     and only on tasks that belong to their own company's requirement.
--     They can never see internal staff notes.

create policy "staff_full_access_messages" on messages
  for all
  using (
    current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
  )
  with check (
    current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
  );

create policy "client_read_own_client_messages" on messages
  for select
  using (
    visibility = 'client'
    and exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      where t.id = messages.task_id
      and r.client_id = current_user_client_id()
    )
  );

create policy "client_create_own_client_messages" on messages
  for insert
  with check (
    visibility = 'client'
    and exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      where t.id = messages.task_id
      and r.client_id = current_user_client_id()
    )
  );

-- The task chat uses Supabase Realtime (postgres_changes) so new
-- messages appear live without a refresh. This requires the table to
-- be added to the `supabase_realtime` publication.
alter publication supabase_realtime add table messages;
