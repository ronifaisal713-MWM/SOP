-- =========================================================
-- MWM Agency OS — Migration 015: Client can see assigned staff names
-- Run this in Supabase SQL Editor AFTER migration_014
-- =========================================================
-- Needed for the client-side @mention picker: a client can already read
-- their own client_team_members rows (who's assigned to them), but had
-- no way to read those staff members' `profiles` rows to get a display
-- name -- profiles was only readable by yourself or same-org staff.

create policy "client_read_assigned_staff_profiles" on profiles
  for select
  using (
    exists (
      select 1 from client_team_members ctm
      where ctm.user_id = profiles.id
      and ctm.client_id = current_user_client_id()
    )
  );
