-- =========================================================
-- MWM Agency OS — Migration 004: Client-scoped requirement access
-- Run this in Supabase SQL Editor AFTER migration_003
-- =========================================================

-- Why this migration exists:
-- migration_002 made `requirements` readable/writable by ANY logged-in
-- user (client or staff) -- fine for early testing with one test user,
-- but wrong now that real, separate client accounts exist. A client
-- should only ever see their OWN company's requirements; staff should
-- see all of them.
--
-- Writing that check directly inside a policy (e.g. referencing
-- `profiles` or `client_users` in a subquery) can cause Postgres RLS
-- recursion/permission issues, since those referenced tables are
-- themselves RLS-protected. The standard fix is two small
-- SECURITY DEFINER helper functions that look up the info once,
-- bypassing RLS internally, and are then safe to call from policies.

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role::text from profiles where id = auth.uid();
$$;

create or replace function public.current_user_client_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select client_id from client_users where id = auth.uid();
$$;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_client_id() to authenticated;

-- ---------- client_users: lock down (was fully open, no RLS) ----------
alter table client_users enable row level security;

create policy "users_read_own_client_user_row" on client_users
  for select
  using (auth.uid() = id);

create policy "staff_read_all_client_users" on client_users
  for select
  using (
    current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
  );

-- ---------- requirements: replace the permissive dev policies ----------
drop policy if exists "authenticated_read_requirements" on requirements;
drop policy if exists "authenticated_create_requirements" on requirements;
drop policy if exists "authenticated_update_requirements" on requirements;

create policy "read_requirements" on requirements
  for select
  using (
    current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
    or client_id = current_user_client_id()
  );

create policy "create_requirements" on requirements
  for insert
  with check (
    current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
    or client_id = current_user_client_id()
  );

create policy "update_requirements" on requirements
  for update
  using (
    current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
    or client_id = current_user_client_id()
  );
