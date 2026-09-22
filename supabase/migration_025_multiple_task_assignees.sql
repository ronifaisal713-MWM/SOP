-- =========================================================
-- MWM Agency OS — Migration 025: Multiple assignees per task
-- Run this in Supabase SQL Editor AFTER migration_024
-- =========================================================
-- Replaces the single tasks.assigned_to column with a proper
-- many-to-many table -- a task can now have any number of people
-- working on it, not just one.

create table if not exists task_assignees (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid references tasks(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (task_id, user_id)
);

alter table task_assignees enable row level security;

create policy "read_task_assignees" on task_assignees
  for select
  using (
    exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      where t.id = task_assignees.task_id
      and (
        current_user_can_access_client(r.client_id)
        or r.client_id = current_user_client_id()
      )
    )
  );

create policy "staff_manage_task_assignees" on task_assignees
  for all
  using (
    exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      where t.id = task_assignees.task_id
      and current_user_can_access_client(r.client_id)
    )
  )
  with check (
    exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      where t.id = task_assignees.task_id
      and current_user_can_access_client(r.client_id)
    )
  );

-- Carry over whoever was already assigned via the old single column,
-- so nothing appears to lose its assignee the moment this runs.
insert into task_assignees (task_id, user_id)
select id, assigned_to from tasks where assigned_to is not null
on conflict (task_id, user_id) do nothing;

-- Replace the old assigned_to-based notification with one that fires
-- per person added, since there can now be several per task.
drop trigger if exists trg_notify_on_task_assigned on tasks;

create or replace function public.notify_on_task_assignee_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
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
