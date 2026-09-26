-- =========================================================
-- MWM Agency OS — Migration 043: Status changes reach the whole team
-- Run this in Supabase SQL Editor AFTER migration_042
-- =========================================================
-- notify_on_task_status_change only notified people in task_assignees
-- plus the client. So on an unassigned task -- which is most of them
-- while work is being triaged -- literally nobody on the agency side
-- found out a status had moved.
--
-- Broadened to match how every other notification in the app is
-- scoped: agency owners/admins, plus any staff assigned to that
-- client, plus anyone specifically assigned to the task, plus the
-- client. The actor is still excluded, and distinct-ing the union
-- stops someone who's both (say) an admin AND a task assignee from
-- getting two copies.

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

  select r.client_id into v_client_id from requirements r where r.id = new.requirement_id;
  if v_client_id is not null then
    select organization_id into v_org_id from clients where id = v_client_id;
  end if;

  -- Agency side: owners/admins, staff assigned to this client, and
  -- anyone assigned to this specific task. Union'd and distinct'd so
  -- nobody who matches twice gets two notifications.
  insert into notifications (user_id, title, body, link)
  select distinct uid, 'Task status updated', v_body, v_link
  from (
    select p.id as uid
    from profiles p
    where v_org_id is not null
      and p.organization_id = v_org_id
      and (
        p.role in ('super_admin', 'admin')
        or exists (
          select 1 from client_team_members ctm
          where ctm.client_id = v_client_id and ctm.user_id = p.id
        )
      )

    union

    select ta.user_id as uid
    from task_assignees ta
    where ta.task_id = new.id
  ) recipients
  where uid is not null and uid <> v_actor;

  -- The client's own users.
  if v_client_id is not null then
    insert into notifications (user_id, title, body, link)
    select cu.id, 'Task status updated', v_body, v_link
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
