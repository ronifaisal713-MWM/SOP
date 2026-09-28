-- =========================================================
-- MWM Agency OS — Migration 048: Internal requirements (no client)
-- Run this in Supabase SQL Editor AFTER migration_047
-- =========================================================
-- Agencies have work that isn't for any client -- internal tooling,
-- admin, process fixes. Until now every requirement needed a client,
-- because the whole permission model derives an organization by
-- joining requirements -> clients.
--
-- Adding organization_id directly to requirements gives client-less
-- rows something to scope against. Existing rows are backfilled from
-- their client, so nothing changes for client work.
--
-- Rule: client_id null = internal. Visible to the agency's own
-- owners/admins and staff; NEVER to any client, since a client has no
-- organization_id of their own to match against.

alter table requirements add column if not exists organization_id uuid references organizations(id) on delete cascade;

-- Backfill from the client so existing rows keep working under the
-- new org-aware policies below.
update requirements r
set organization_id = c.organization_id
from clients c
where r.client_id = c.id and r.organization_id is null;

create index if not exists requirements_org_idx on requirements (organization_id);

-- ---------- Requirements: allow internal rows ----------
drop policy if exists "read_requirements" on requirements;
create policy "read_requirements" on requirements
  for select
  using (
    -- Client work: unchanged.
    (client_id is not null and current_user_can_access_client(client_id))
    or (client_id is not null and client_id = current_user_client_id() and deleted_at is null)
    -- Internal work: agency staff in the same org only. A client's
    -- current_user_org_id() is null, so they can never match here.
    or (
      client_id is null
      and organization_id is not null
      and organization_id = current_user_org_id()
      and current_user_role() in ('super_admin', 'admin', 'project_manager', 'team_lead', 'employee')
    )
  );

drop policy if exists "staff_update_requirements" on requirements;
create policy "staff_update_requirements" on requirements
  for update
  using (
    (client_id is not null and current_user_can_access_client(client_id))
    or (
      client_id is null
      and organization_id = current_user_org_id()
      and current_user_role() in ('super_admin', 'admin', 'project_manager', 'team_lead', 'employee')
    )
  )
  with check (
    (client_id is not null and current_user_can_access_client(client_id))
    or (
      client_id is null
      and organization_id = current_user_org_id()
      and current_user_role() in ('super_admin', 'admin', 'project_manager', 'team_lead', 'employee')
    )
  );

drop policy if exists "create_requirements" on requirements;
create policy "create_requirements" on requirements
  for insert
  with check (
    (client_id is not null and current_user_can_access_client(client_id))
    or (client_id is not null and client_id = current_user_client_id())
    or (
      client_id is null
      and organization_id = current_user_org_id()
      and current_user_role() in ('super_admin', 'admin', 'project_manager', 'team_lead', 'employee')
    )
  );

-- ---------- Tasks: same treatment ----------
-- The task policies join through requirements to a client, which
-- excluded internal tasks entirely.
drop policy if exists "read_tasks" on tasks;
create policy "read_tasks" on tasks
  for select
  using (
    deleted_at is null
    and exists (
      select 1 from requirements r
      where r.id = tasks.requirement_id
      and (
        (r.client_id is not null and current_user_can_access_client(r.client_id))
        or (r.client_id is not null and r.client_id = current_user_client_id())
        or (
          r.client_id is null
          and r.organization_id = current_user_org_id()
          and current_user_role() in ('super_admin', 'admin', 'project_manager', 'team_lead', 'employee')
        )
      )
    )
  );

drop policy if exists "staff_update_tasks" on tasks;
create policy "staff_update_tasks" on tasks
  for update
  using (
    deleted_at is null
    and exists (
      select 1 from requirements r
      where r.id = tasks.requirement_id
      and (
        (r.client_id is not null and current_user_can_access_client(r.client_id))
        or (
          r.client_id is null
          and r.organization_id = current_user_org_id()
          and current_user_role() in ('super_admin', 'admin', 'project_manager', 'team_lead', 'employee')
        )
      )
    )
  );

-- ---------- Checklist / time / assignees on internal tasks ----------
drop policy if exists "read_task_checklist" on task_checklist_items;
create policy "read_task_checklist" on task_checklist_items
  for select
  using (
    exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      where t.id = task_checklist_items.task_id
      and (
        (r.client_id is not null and current_user_can_access_client(r.client_id))
        or (r.client_id is not null and r.client_id = current_user_client_id())
        or (r.client_id is null and r.organization_id = current_user_org_id())
      )
    )
  );

drop policy if exists "staff_manage_task_checklist" on task_checklist_items;
create policy "staff_manage_task_checklist" on task_checklist_items
  for all
  using (
    exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      where t.id = task_checklist_items.task_id
      and (
        (r.client_id is not null and current_user_can_access_client(r.client_id))
        or (r.client_id is null and r.organization_id = current_user_org_id())
      )
    )
  )
  with check (
    exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      where t.id = task_checklist_items.task_id
      and (
        (r.client_id is not null and current_user_can_access_client(r.client_id))
        or (r.client_id is null and r.organization_id = current_user_org_id())
      )
    )
  );

drop policy if exists "read_time_entries" on time_entries;
create policy "read_time_entries" on time_entries
  for select
  using (
    exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      where t.id = time_entries.task_id
      and (
        (r.client_id is not null and current_user_can_access_client(r.client_id))
        or (r.client_id is not null and r.client_id = current_user_client_id())
        or (r.client_id is null and r.organization_id = current_user_org_id())
      )
    )
  );

drop policy if exists "staff_insert_own_time_entries" on time_entries;
create policy "staff_insert_own_time_entries" on time_entries
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      where t.id = time_entries.task_id
      and (
        (r.client_id is not null and current_user_can_access_client(r.client_id))
        or (r.client_id is null and r.organization_id = current_user_org_id())
      )
    )
  );

drop policy if exists "read_task_assignees" on task_assignees;
create policy "read_task_assignees" on task_assignees
  for select
  using (
    exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      where t.id = task_assignees.task_id
      and (
        (r.client_id is not null and current_user_can_access_client(r.client_id))
        or (r.client_id is not null and r.client_id = current_user_client_id())
        or (r.client_id is null and r.organization_id = current_user_org_id())
      )
    )
  );

drop policy if exists "staff_manage_task_assignees" on task_assignees;
create policy "staff_manage_task_assignees" on task_assignees
  for all
  using (
    exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      where t.id = task_assignees.task_id
      and (
        (r.client_id is not null and current_user_can_access_client(r.client_id))
        or (r.client_id is null and r.organization_id = current_user_org_id())
      )
    )
  )
  with check (
    exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      where t.id = task_assignees.task_id
      and (
        (r.client_id is not null and current_user_can_access_client(r.client_id))
        or (r.client_id is null and r.organization_id = current_user_org_id())
      )
    )
  );

-- ---------- Notifications: don't break on a null client ----------
-- These looked up the client to find the org; an internal task has no
-- client, so they'd bail out and notify nobody.
create or replace function public.notify_on_task_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_org_id uuid;
  v_actor uuid;
  v_body text;
  v_link text;
begin
  if tg_op <> 'UPDATE' or old.status is not distinct from new.status then
    return new;
  end if;

  v_actor := coalesce(new.last_changed_by, auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  v_body := new.title || ' -> ' || new.status;
  v_link := '/dashboard/tasks/' || new.id;

  select r.client_id, r.organization_id into v_client_id, v_org_id
  from requirements r where r.id = new.requirement_id;

  -- Client work resolves the org through the client; internal work
  -- carries it directly.
  if v_client_id is not null then
    select organization_id into v_org_id from clients where id = v_client_id;
  end if;

  insert into notifications (user_id, title, body, link)
  select distinct uid, 'Task status updated', v_body, v_link
  from (
    select p.id as uid
    from profiles p
    where v_org_id is not null
      and p.organization_id = v_org_id
      and (
        p.role in ('super_admin', 'admin')
        or (
          v_client_id is not null
          and exists (
            select 1 from client_team_members ctm
            where ctm.client_id = v_client_id and ctm.user_id = p.id
          )
        )
      )

    union

    select ta.user_id as uid
    from task_assignees ta
    where ta.task_id = new.id
  ) recipients
  where uid is not null and uid <> v_actor;

  if v_client_id is not null then
    insert into notifications (user_id, title, body, link)
    select cu.id, 'Task status updated', v_body, v_link
    from client_users cu
    where cu.client_id = v_client_id and cu.id <> v_actor;
  end if;

  return new;
end;
$$;

create or replace function public.notify_on_new_requirement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if new.client_id is not null then
    select organization_id into v_org_id from clients where id = new.client_id;
  else
    v_org_id := new.organization_id;
  end if;

  if v_org_id is null then
    return new;
  end if;

  insert into notifications (user_id, title, body, link)
  select p.id,
    case when new.client_id is null then 'New internal requirement' else 'New Requirement' end,
    new.title,
    '/dashboard/requirements/' || new.id
  from profiles p
  where p.organization_id = v_org_id
    and p.id is distinct from new.created_by
    and (
      p.role in ('super_admin', 'admin')
      or (
        new.client_id is not null
        and exists (
          select 1 from client_team_members ctm
          where ctm.client_id = new.client_id and ctm.user_id = p.id
        )
      )
      -- Internal requirements concern the whole agency team.
      or new.client_id is null
    );

  if new.client_id is not null then
    insert into notifications (user_id, title, body, link)
    select cu.id, 'New Requirement', new.title, '/dashboard/requirements/' || new.id
    from client_users cu
    where cu.client_id = new.client_id
      and cu.id is distinct from new.created_by;
  end if;

  return new;
end;
$$;
