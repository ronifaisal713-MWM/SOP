-- =========================================================
-- MWM Agency OS — Migration 016: Monthly Reports
-- Run this in Supabase SQL Editor AFTER migration_015
-- =========================================================
-- Staff/Agency submit a monthly report (with an optional file) for a
-- client. Clients can only view -- never delete. Deleting is a soft
-- delete (deleted_at/deleted_by) so staff/agency retain a visible
-- audit trail ("Deleted by X"), while a deleted report simply
-- disappears from the client's view entirely.

create table if not exists monthly_reports (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade,
  title text not null,
  report_month date not null,  -- store as the 1st of the month, e.g. 2026-09-01
  description text,
  storage_path text,
  file_name text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

alter table monthly_reports enable row level security;

-- Staff/Agency: full visibility (including deleted ones, for the audit
-- trail), scoped the same way as everything else -- Agency sees any
-- client in their org, Staff only their assigned clients.
create policy "staff_read_monthly_reports" on monthly_reports
  for select
  using (current_user_can_access_client(client_id));

create policy "staff_create_monthly_reports" on monthly_reports
  for insert
  with check (
    current_user_can_access_client(client_id)
    and created_by = auth.uid()
  );

-- Also used for the soft-delete (sets deleted_at/deleted_by) -- there's
-- no separate DELETE policy because rows are never actually removed.
create policy "staff_update_monthly_reports" on monthly_reports
  for update
  using (current_user_can_access_client(client_id))
  with check (current_user_can_access_client(client_id));

-- Clients: only their own reports, and never the deleted ones.
create policy "client_read_own_monthly_reports" on monthly_reports
  for select
  using (
    client_id = current_user_client_id()
    and deleted_at is null
  );
