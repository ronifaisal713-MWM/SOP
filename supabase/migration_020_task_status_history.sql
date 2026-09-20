-- =========================================================
-- MWM Agency OS — Migration 020: Task status change history
-- Run this in Supabase SQL Editor AFTER migration_019
-- =========================================================
-- Automatically records every task status change into activity_log
-- (this table existed since schema.sql but had RLS enabled with no
-- policy at all -- and nothing ever wrote to it -- so it's been
-- completely unused until now). A trigger means no status change can
-- ever happen without being logged, regardless of which screen it
-- came from (Task Board, Task detail, My Tasks approve/revision).

create or replace function public.log_task_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into activity_log (actor_id, action, entity_type, entity_id)
    values (auth.uid(), 'Status changed from ' || old.status || ' to ' || new.status, 'task', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_task_status_change on tasks;
create trigger trg_log_task_status_change
after update on tasks
for each row execute function public.log_task_status_change();

-- Read access: anyone who can already see the task (staff/agency with
-- access to its client, or the client themselves) can see its history.
-- The insert itself needs no policy -- the trigger function is
-- SECURITY DEFINER, so it bypasses RLS the same way the notification
-- triggers already do.
create policy "read_task_activity_log" on activity_log
  for select
  using (
    entity_type = 'task'
    and exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      where t.id = activity_log.entity_id
      and (
        current_user_can_access_client(r.client_id)
        or r.client_id = current_user_client_id()
      )
    )
  );
