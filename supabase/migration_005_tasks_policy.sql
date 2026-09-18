-- =========================================================
-- MWM Agency OS — Migration 005: Tasks access policy
-- Run this in Supabase SQL Editor AFTER migration_004
-- =========================================================

-- Same issue as requirements in migration_002: schema.sql enabled RLS
-- on `tasks` but added no policy, so nobody could read/create/update
-- tasks yet. Temporary permissive policy for the build phase --
-- tighten to real staff-only rules once role checks are wired up
-- everywhere (clients generally shouldn't see internal task detail,
-- only their requirement's overall status).

create policy "authenticated_read_tasks" on tasks
  for select
  using (auth.role() = 'authenticated');

create policy "authenticated_create_tasks" on tasks
  for insert
  with check (auth.role() = 'authenticated');

create policy "authenticated_update_tasks" on tasks
  for update
  using (auth.role() = 'authenticated');
