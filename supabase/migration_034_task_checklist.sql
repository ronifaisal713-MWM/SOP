-- =========================================================
-- MWM Agency OS — Migration 034: Task Checklist / Subtasks
-- Run this in Supabase SQL Editor AFTER migration_033
-- =========================================================
-- task_checklist_items has existed since schema.sql but had RLS
-- enabled with no policies at all -- meaning it was completely
-- unusable (every query blocked). This finishes it: Staff/Agency
-- manage the checklist; the client can see the items and their
-- progress, matching the transparency the rest of the app gives them,
-- but can't tick or edit anything.

alter table task_checklist_items add column if not exists created_at timestamptz default now();
alter table task_checklist_items add column if not exists completed_at timestamptz;
alter table task_checklist_items add column if not exists completed_by uuid references auth.users(id) on delete set null;

alter table task_checklist_items enable row level security;

create index if not exists task_checklist_items_task_idx on task_checklist_items (task_id);

-- Anyone who can see the task can see its checklist.
create policy "read_task_checklist" on task_checklist_items
  for select
  using (
    exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      where t.id = task_checklist_items.task_id
      and (
        current_user_can_access_client(r.client_id)
        or r.client_id = current_user_client_id()
      )
    )
  );

-- Only staff/agency add, tick, or remove items.
create policy "staff_manage_task_checklist" on task_checklist_items
  for all
  using (
    exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      where t.id = task_checklist_items.task_id
      and current_user_can_access_client(r.client_id)
    )
  )
  with check (
    exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      where t.id = task_checklist_items.task_id
      and current_user_can_access_client(r.client_id)
    )
  );
