-- =========================================================
-- MWM Agency OS — Migration 007: Multi-tenant foundation
-- Run this in Supabase SQL Editor AFTER migration_006
-- =========================================================

-- Why this migration exists:
-- Until now, every staff member could see every client/requirement/task/
-- message in the whole database, because policies only checked "is this
-- person staff?" -- never "does this belong to THEIR agency?". That was
-- fine with one agency (MWM) using the system. Now that any agency can
-- sign up, every table that holds an agency's data must be scoped by
-- organization, or agency A's staff could read agency B's clients.

-- ---------- 1. clients now belong to an organization (agency) ----------
alter table clients add column if not exists organization_id uuid references organizations(id);

-- ---------- 2. helper: current user's organization_id ----------
-- Staff: taken from their own profiles row.
-- Client users: derived from their client company's organization_id.
-- SECURITY DEFINER so it can read `profiles`/`client_users`/`clients`
-- internally without those tables' own RLS getting in the way (avoids
-- the recursion problem described in migration_004).
create or replace function public.current_user_org_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select organization_id from profiles where id = auth.uid()),
    (
      select c.organization_id
      from client_users cu
      join clients c on c.id = cu.client_id
      where cu.id = auth.uid()
    )
  );
$$;

grant execute on function public.current_user_org_id() to authenticated;

-- ---------- 3. clients: replace the old (non-org-scoped) policy ----------
drop policy if exists "staff_full_access_clients" on clients;

create policy "staff_read_own_org_clients" on clients
  for select
  using (
    current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
    and organization_id = current_user_org_id()
  );

create policy "client_read_own_row" on clients
  for select
  using (id = current_user_client_id());

-- ---------- 4. requirements: add organization scoping for staff ----------
drop policy if exists "read_requirements" on requirements;
drop policy if exists "create_requirements" on requirements;
drop policy if exists "update_requirements" on requirements;

create policy "read_requirements" on requirements
  for select
  using (
    (
      current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
      and exists (
        select 1 from clients c
        where c.id = requirements.client_id
        and c.organization_id = current_user_org_id()
      )
    )
    or client_id = current_user_client_id()
  );

create policy "create_requirements" on requirements
  for insert
  with check (
    (
      current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
      and exists (
        select 1 from clients c
        where c.id = requirements.client_id
        and c.organization_id = current_user_org_id()
      )
    )
    or client_id = current_user_client_id()
  );

create policy "update_requirements" on requirements
  for update
  using (
    (
      current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
      and exists (
        select 1 from clients c
        where c.id = requirements.client_id
        and c.organization_id = current_user_org_id()
      )
    )
    or client_id = current_user_client_id()
  );

-- ---------- 5. tasks: replace the permissive dev policy with org scoping ----------
drop policy if exists "authenticated_read_tasks" on tasks;
drop policy if exists "authenticated_create_tasks" on tasks;
drop policy if exists "authenticated_update_tasks" on tasks;

create policy "read_tasks" on tasks
  for select
  using (
    exists (
      select 1 from requirements r
      join clients c on c.id = r.client_id
      where r.id = tasks.requirement_id
      and (
        (
          current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
          and c.organization_id = current_user_org_id()
        )
        or c.id = current_user_client_id()
      )
    )
  );

create policy "staff_create_tasks" on tasks
  for insert
  with check (
    current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
    and exists (
      select 1 from requirements r
      join clients c on c.id = r.client_id
      where r.id = tasks.requirement_id
      and c.organization_id = current_user_org_id()
    )
  );

create policy "staff_update_tasks" on tasks
  for update
  using (
    current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
    and exists (
      select 1 from requirements r
      join clients c on c.id = r.client_id
      where r.id = tasks.requirement_id
      and c.organization_id = current_user_org_id()
    )
  );

-- ---------- 6. messages: add organization scoping for the staff policy ----------
drop policy if exists "staff_full_access_messages" on messages;

create policy "staff_org_access_messages" on messages
  for all
  using (
    current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
    and exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      join clients c on c.id = r.client_id
      where t.id = messages.task_id
      and c.organization_id = current_user_org_id()
    )
  )
  with check (
    current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
    and exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      join clients c on c.id = r.client_id
      where t.id = messages.task_id
      and c.organization_id = current_user_org_id()
    )
  );

-- ---------- 7. client_users: add organization scoping for the staff policy ----------
drop policy if exists "staff_read_all_client_users" on client_users;

create policy "staff_read_own_org_client_users" on client_users
  for select
  using (
    current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
    and exists (
      select 1 from clients c
      where c.id = client_users.client_id
      and c.organization_id = current_user_org_id()
    )
  );

-- ---------- 8. profiles: staff can see co-workers in their own agency ----------
-- Needed to show "assigned to <name>" with a name/avatar anywhere in the
-- app. Safe from recursion: current_user_org_id() is SECURITY DEFINER,
-- so it bypasses profiles' own RLS while resolving.
create policy "staff_read_same_org_profiles" on profiles
  for select
  using (
    organization_id is not null
    and organization_id = current_user_org_id()
  );

-- ---------- 9. client_team_members: which staff are assigned to which client ----------
create table if not exists client_team_members (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (client_id, user_id)
);

alter table client_team_members enable row level security;

create policy "staff_manage_own_org_assignments" on client_team_members
  for all
  using (
    current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
    and exists (
      select 1 from clients c
      where c.id = client_team_members.client_id
      and c.organization_id = current_user_org_id()
    )
  )
  with check (
    current_user_role() in ('super_admin','admin','project_manager','team_lead','employee')
    and exists (
      select 1 from clients c
      where c.id = client_team_members.client_id
      and c.organization_id = current_user_org_id()
    )
  );

create policy "client_read_own_assignments" on client_team_members
  for select
  using (client_id = current_user_client_id());

-- ---------- 10. backfill: existing MWM data belongs to MWM's organization ----------
-- Creates (or reuses) an "Macarthur Web & Marketing Agency" organization,
-- attaches your existing super_admin profile to it, and attaches all
-- clients created before this migration to it too -- otherwise they'd be
-- orphaned (organization_id = null) and would stop showing up anywhere.
do $$
declare
  mwm_org_id uuid;
begin
  select id into mwm_org_id from organizations where name = 'Macarthur Web & Marketing Agency' limit 1;

  if mwm_org_id is null then
    insert into organizations (name) values ('Macarthur Web & Marketing Agency')
    returning id into mwm_org_id;
  end if;

  update profiles set organization_id = mwm_org_id
  where role = 'super_admin' and organization_id is null;

  update clients set organization_id = mwm_org_id
  where organization_id is null;
end $$;
