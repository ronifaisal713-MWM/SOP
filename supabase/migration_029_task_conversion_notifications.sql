-- =========================================================
-- MWM Agency OS — Migration 029: Task-created-from-Requirement notifications
-- Run this in Supabase SQL Editor AFTER migration_028
-- =========================================================
-- Same symmetric pattern as migration_028's new-requirement notice:
-- whenever a requirement gets converted into a task, everyone else
-- with access to it is notified -- the client (it's their work moving
-- forward), and any other Staff/Agency with access to that client.
-- Whoever DID the conversion is excluded. These land on the existing
-- Task Board / My Tasks badge automatically, since the link points at
-- /dashboard/tasks/{id}, exactly like every other task notification.

create or replace function public.notify_on_task_created_from_requirement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_org_id uuid;
begin
  if new.requirement_id is null then
    return new;
  end if;

  select client_id into v_client_id from requirements where id = new.requirement_id;
  if v_client_id is null then
    return new;
  end if;

  select organization_id into v_org_id from clients where id = v_client_id;

  -- Agency owners/admins of this org, and any staff specifically
  -- assigned to this client.
  insert into notifications (user_id, title, body, link)
  select p.id, 'Requirement converted to Task', new.title, '/dashboard/tasks/' || new.id
  from profiles p
  where p.organization_id = v_org_id
    and p.id is distinct from auth.uid()
    and (
      p.role in ('super_admin', 'admin')
      or exists (
        select 1 from client_team_members ctm
        where ctm.client_id = v_client_id and ctm.user_id = p.id
      )
    );

  -- The client's own users.
  insert into notifications (user_id, title, body, link)
  select cu.id, 'Your requirement is now a Task', new.title, '/dashboard/tasks/' || new.id
  from client_users cu
  where cu.client_id = v_client_id
    and cu.id is distinct from auth.uid();

  return new;
end;
$$;

drop trigger if exists trg_notify_on_task_created_from_requirement on tasks;
create trigger trg_notify_on_task_created_from_requirement
after insert on tasks
for each row execute function public.notify_on_task_created_from_requirement();
