-- =========================================================
-- MWM Agency OS — Migration 038: Stop notifying people about their own actions
-- Run this in Supabase SQL Editor AFTER migration_037
-- =========================================================
-- Several triggers excluded the actor with `is distinct from
-- auth.uid()`. But these functions run as SECURITY DEFINER, where
-- auth.uid() frequently returns NULL -- and `x is distinct from NULL`
-- is TRUE for every row, so the exclusion silently did nothing and the
-- person who made the change got notified about their own action.
--
-- Fixed by recording the actor on the row itself (a column the trigger
-- can read reliably) instead of depending on session state.

-- ---------- 1. Track who changed a task's status ----------
alter table tasks add column if not exists last_changed_by uuid references auth.users(id) on delete set null;

-- Stamp it from the session where that IS reliable (a normal client
-- update), falling back to leaving it null rather than guessing.
create or replace function public.stamp_task_last_changed_by()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.last_changed_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_task_last_changed_by on tasks;
create trigger trg_stamp_task_last_changed_by
before update on tasks
for each row execute function public.stamp_task_last_changed_by();

-- ---------- 2. Task status change -- exclude the actual changer ----------
create or replace function public.notify_on_task_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_actor uuid;
begin
  if tg_op <> 'UPDATE' or old.status is not distinct from new.status then
    return new;
  end if;

  -- Prefer the stamped column; coalesce to a zero uuid so the
  -- comparison below still excludes nobody rather than everybody if
  -- it's somehow null.
  v_actor := coalesce(new.last_changed_by, '00000000-0000-0000-0000-000000000000'::uuid);

  select r.client_id into v_client_id from requirements r where r.id = new.requirement_id;

  insert into notifications (user_id, title, body, link)
  select ta.user_id, 'Task status updated', new.title || ' -> ' || new.status, '/dashboard/tasks/' || new.id
  from task_assignees ta
  where ta.task_id = new.id and ta.user_id <> v_actor;

  if v_client_id is not null then
    insert into notifications (user_id, title, body, link)
    select cu.id, 'Task status updated', new.title || ' -> ' || new.status, '/dashboard/tasks/' || new.id
    from client_users cu
    where cu.client_id = v_client_id and cu.id <> v_actor;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_task_status_change on tasks;
create trigger trg_notify_on_task_status_change
after update on tasks
for each row execute function public.notify_on_task_status_change();

-- ---------- 3. Requirement converted to task -- exclude the converter ----------
-- tasks has no created_by, but the requirement it came from records
-- who owns it, and conversion is always done by staff/agency -- so use
-- the session where available and fall back to notifying everyone
-- rather than no one.
create or replace function public.notify_on_task_created_from_requirement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_org_id uuid;
  v_actor uuid;
begin
  if new.requirement_id is null then
    return new;
  end if;

  v_actor := coalesce(new.last_changed_by, auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);

  select client_id into v_client_id from requirements where id = new.requirement_id;
  if v_client_id is null then
    return new;
  end if;

  select organization_id into v_org_id from clients where id = v_client_id;

  insert into notifications (user_id, title, body, link)
  select p.id, 'Requirement converted to Task', new.title, '/dashboard/tasks/' || new.id
  from profiles p
  where p.organization_id = v_org_id
    and p.id <> v_actor
    and (
      p.role in ('super_admin', 'admin')
      or exists (
        select 1 from client_team_members ctm
        where ctm.client_id = v_client_id and ctm.user_id = p.id
      )
    );

  insert into notifications (user_id, title, body, link)
  select cu.id, 'Your requirement is now a Task', new.title, '/dashboard/tasks/' || new.id
  from client_users cu
  where cu.client_id = v_client_id and cu.id <> v_actor;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_task_created_from_requirement on tasks;
create trigger trg_notify_on_task_created_from_requirement
after insert on tasks
for each row execute function public.notify_on_task_created_from_requirement();

-- ---------- 4. Assigned to a client -- don't notify someone who assigned themselves ----------
create or replace function public.notify_on_client_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_name text;
begin
  -- Here auth.uid() is reliable enough to skip the self-assign case,
  -- and if it's null we simply notify -- which is the safe direction.
  if auth.uid() is not null and new.user_id = auth.uid() then
    return new;
  end if;

  select company_name into v_company_name from clients where id = new.client_id;

  insert into notifications (user_id, title, body, link)
  values (
    new.user_id,
    'You were assigned to a client',
    coalesce(v_company_name, 'A client'),
    '/dashboard/clients/' || new.client_id
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_on_client_assignment on client_team_members;
create trigger trg_notify_on_client_assignment
after insert on client_team_members
for each row execute function public.notify_on_client_assignment();

-- ---------- 5. Task assignee added -- don't notify a self-assign ----------
create or replace function public.notify_on_task_assignee_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if auth.uid() is not null and new.user_id = auth.uid() then
    return new;
  end if;

  select title into v_title from tasks where id = new.task_id;
  insert into notifications (user_id, title, body, link)
  values (new.user_id, 'Task assigned to you', v_title, '/dashboard/tasks/' || new.task_id);
  return new;
end;
$$;

drop trigger if exists trg_notify_on_task_assignee_added on task_assignees;
create trigger trg_notify_on_task_assignee_added
after insert on task_assignees
for each row execute function public.notify_on_task_assignee_added();
