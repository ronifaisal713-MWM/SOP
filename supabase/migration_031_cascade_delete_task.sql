-- =========================================================
-- MWM Agency OS — Migration 031: Deleting a Requirement removes its Task too
-- Run this in Supabase SQL Editor AFTER migration_030
-- =========================================================
-- Different from how a deleted Requirement behaves (still visible to
-- staff/agency with a "(Deleted)" tag): a task whose source
-- requirement gets deleted is completely removed from the Task Board
-- for EVERYONE, no exception -- the audit trail already lives in the
-- Requirement's own Journey timeline, so there's no need for a ghost
-- card on the board too.

alter table tasks add column if not exists deleted_at timestamptz;
alter table tasks add column if not exists deleted_by uuid references auth.users(id) on delete set null;

-- Cascade: the moment a requirement's deleted_at is set, soft-delete
-- its task the same way, by the same person.
create or replace function public.cascade_delete_task_on_requirement_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update tasks
    set deleted_at = new.deleted_at, deleted_by = new.deleted_by
    where requirement_id = new.id and deleted_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cascade_delete_task_on_requirement_delete on requirements;
create trigger trg_cascade_delete_task_on_requirement_delete
after update on requirements
for each row execute function public.cascade_delete_task_on_requirement_delete();

-- Completely hide a deleted task from everyone -- unlike requirements,
-- no exception for staff/agency here.
drop policy if exists "read_tasks" on tasks;
create policy "read_tasks" on tasks
  for select
  using (
    deleted_at is null
    and exists (
      select 1 from requirements r
      where r.id = tasks.requirement_id
      and (
        current_user_can_access_client(r.client_id)
        or r.client_id = current_user_client_id()
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
      and current_user_can_access_client(r.client_id)
    )
  );

-- Same guard on the client's own status-update policy (defense in
-- depth -- deleted tasks are already hidden from SELECT entirely, but
-- this stops a direct API call to a stale/known id too).
drop policy if exists "client_update_own_task_status" on tasks;
create policy "client_update_own_task_status" on tasks
  for update
  using (
    deleted_at is null
    and exists (
      select 1 from requirements r
      join clients c on c.id = r.client_id
      where r.id = tasks.requirement_id
      and c.id = current_user_client_id()
    )
  )
  with check (
    exists (
      select 1 from requirements r
      join clients c on c.id = r.client_id
      where r.id = tasks.requirement_id
      and c.id = current_user_client_id()
    )
    and status in ('approved', 'revision')
  );
