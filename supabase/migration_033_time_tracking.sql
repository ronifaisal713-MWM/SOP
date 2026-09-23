-- =========================================================
-- MWM Agency OS — Migration 033: Time Tracking
-- Run this in Supabase SQL Editor AFTER migration_032
-- =========================================================
-- Staff start/stop a timer on a task (or log time manually after the
-- fact). Total time is visible to the client too, for the same
-- transparency reasons the rest of the app already follows -- clients
-- can see, but only Staff/Agency can log or edit entries.

create table if not exists time_entries (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid references tasks(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer,
  notes text,
  created_at timestamptz default now()
);

alter table time_entries enable row level security;

-- One running timer per person, enforced by the database -- a second
-- "start" while one is already open is rejected outright, rather than
-- relying on the UI having hidden the button.
create unique index if not exists one_running_timer_per_user
  on time_entries (user_id)
  where ended_at is null;

create index if not exists time_entries_task_idx on time_entries (task_id);

-- Anyone who can already see the task (staff/agency with access, or
-- the client) can see its time entries.
create policy "read_time_entries" on time_entries
  for select
  using (
    exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      where t.id = time_entries.task_id
      and (
        current_user_can_access_client(r.client_id)
        or r.client_id = current_user_client_id()
      )
    )
  );

-- Only Staff/Agency can log time, and only as themselves.
create policy "staff_create_time_entries" on time_entries
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from tasks t
      join requirements r on r.id = t.requirement_id
      where t.id = time_entries.task_id
      and current_user_can_access_client(r.client_id)
    )
  );

-- Stopping your own running timer, editing your own manual entry, or
-- (for Agency) correcting anyone's entry within their org's clients.
create policy "manage_own_or_agency_time_entries" on time_entries
  for update
  using (
    user_id = auth.uid()
    or (
      current_user_role() in ('super_admin', 'admin')
      and exists (
        select 1 from tasks t
        join requirements r on r.id = t.requirement_id
        where t.id = time_entries.task_id and current_user_can_access_client(r.client_id)
      )
    )
  );

create policy "delete_own_or_agency_time_entries" on time_entries
  for delete
  using (
    user_id = auth.uid()
    or (
      current_user_role() in ('super_admin', 'admin')
      and exists (
        select 1 from tasks t
        join requirements r on r.id = t.requirement_id
        where t.id = time_entries.task_id and current_user_can_access_client(r.client_id)
      )
    )
  );
